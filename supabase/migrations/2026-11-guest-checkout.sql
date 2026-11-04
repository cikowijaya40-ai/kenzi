-- =====================================================================
-- MIGRASI: Guest checkout (beli tanpa login, bayar QRIS langsung)
-- Jalankan SEKALI di Supabase -> SQL Editor. Aman dijalankan ulang.
-- (Sudah otomatis ikut di supabase/schema.sql untuk instalasi baru.)
-- =====================================================================

-- 1) Penanda akun yang dibuat otomatis saat beli pertama + kredensial awal (terenkripsi AES-GCM)
alter table users add column if not exists auto_created boolean not null default false;
alter table users add column if not exists init_cred text;

-- 2) Tandai pesanan lunas secara ATOMIK & IDEMPOTENT.
--    transitioned = true HANYA untuk pemanggil pertama -> hanya dia yang boleh mengirim lisensi.
create or replace function mark_order_paid(p_invoice text)
returns table (transitioned boolean, status text)
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where invoice_no = p_invoice for update;
  if not found then
    return query select false, 'NOT_FOUND'::text; return;
  end if;
  if o.status = 'PAID' then
    return query select false, 'ALREADY_PAID'::text; return;
  end if;
  if o.status not in ('PENDING', 'EXPIRED', 'CANCELLED') then
    return query select false, o.status::text; return;
  end if;

  update orders set status = 'PAID', updated_at = now() where id = o.id;
  update product_items
     set stock = greatest(coalesce(stock, 999) - 1, 0),
         in_stock = (coalesce(stock, 999) - 1) > 0
   where product_slug = o.product_slug and sku = o.item_sku;
  return query select true, 'PAID'::text;
end $$;

-- 3) Perawatan harian: kadaluarsakan pesanan QRIS yang tak dibayar & bersihkan akun otomatis yang tak pernah beli
create or replace function run_maintenance()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int; e int;
begin
  update topups set status = 'EXPIRED' where status = 'PENDING' and created_at < now() - interval '2 hours';
  get diagnostics a = row_count;
  delete from rate_limits where reset_at < now() - interval '1 day';
  get diagnostics b = row_count;
  delete from admin_reset_requests where expires_at < now() - interval '7 days';
  get diagnostics c = row_count;
  update orders set status = 'EXPIRED', updated_at = now()
   where status = 'PENDING' and payment_method <> 'SALDO' and created_at < now() - interval '2 hours';
  get diagnostics d = row_count;
  -- akun otomatis yang tidak pernah punya pesanan lunas / saldo, umur > 3 hari
  delete from users u
   where u.auto_created and u.created_at < now() - interval '3 days' and u.balance = 0
     and not exists (select 1 from orders o where o.user_id = u.id and o.status in ('PAID'))
     and not exists (select 1 from topups t where t.user_id = u.id and t.status = 'PAID');
  get diagnostics e = row_count;
  return jsonb_build_object('topups_expired', a, 'rate_limits_purged', b, 'reset_purged', c,
                            'orders_expired', d, 'guest_users_purged', e);
end $$;

revoke all on function mark_order_paid(text) from public, anon, authenticated;
grant execute on function mark_order_paid(text) to service_role;
revoke all on function run_maintenance() from public, anon, authenticated;
grant execute on function run_maintenance() to service_role;
