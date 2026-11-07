-- =====================================================================
-- MIGRASI (OPSIONAL tapi disarankan): hemat storage & query Supabase gratisan
-- Jalankan SEKALI di Supabase -> SQL Editor. Aman dijalankan ulang.
-- (Sudah otomatis ikut di supabase/schema.sql untuk instalasi baru.)
--
-- 1) Index parsial untuk pesanan PENDING (dipakai "Cek Semua Pending" & cron harian).
-- 2) run_maintenance() (jalan 1x/hari lewat cron Vercel) sekarang juga:
--    - membuang pesanan/top up yang TIDAK PERNAH dibayar dan sudah > 45 hari,
--    - memangkas data QR/tutorial pembayaran pada pesanan lunas > 90 hari.
--    Pesanan LUNAS, saldo, dan mutasi tidak pernah dihapus.
-- =====================================================================
create index if not exists orders_pending_idx on orders (created_at desc) where status = 'PENDING';

create or replace function run_maintenance()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int; e int; f int; g int; h int;
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
  -- HEMAT STORAGE (batas gratis 500MB): buang tagihan yang TIDAK PERNAH dibayar & sudah > 45 hari
  delete from orders where status in ('EXPIRED','CANCELLED') and created_at < now() - interval '45 days';
  get diagnostics f = row_count;
  delete from topups where status in ('EXPIRED','FAILED','CANCELLED') and created_at < now() - interval '45 days';
  get diagnostics g = row_count;
  -- Pesanan lunas > 90 hari: data QR/tutorial pembayaran tidak dipakai lagi (yang disimpan hanya nama gateway)
  update orders set payment_data = jsonb_build_object('gateway_provider', payment_data->'gateway_provider')
   where status = 'PAID' and created_at < now() - interval '90 days'
     and payment_data is not null and payment_data <> '{}'::jsonb
     and (select count(*) from jsonb_object_keys(payment_data)) > 1;
  get diagnostics h = row_count;
  return jsonb_build_object('topups_expired', a, 'rate_limits_purged', b, 'reset_purged', c,
                            'orders_expired', d, 'guest_users_purged', e,
                            'old_unpaid_orders_purged', f, 'old_unpaid_topups_purged', g, 'old_payment_data_trimmed', h);
end $$;
