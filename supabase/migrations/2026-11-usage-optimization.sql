-- =====================================================================
-- MIGRASI: Optimasi usage Supabase gratisan (ukuran database)
-- Jalankan SEKALI di Supabase -> SQL Editor. Aman dijalankan ulang.
-- (Sudah otomatis ikut di supabase/schema.sql untuk instalasi baru.)
--
-- Memperbarui run_maintenance() yang dipanggil cron harian Vercel:
--  * membuang data QR & teks tutorial pembayaran dari pesanan/top-up yang sudah tidak PENDING
--  * menghapus pesanan/top-up EXPIRED yang tidak pernah dibayar > 30 hari
-- =====================================================================
create or replace function run_maintenance()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int;
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

  -- HEMAT UKURAN DATABASE (kuota gratis 500 MB): data QR & teks tutorial pembayaran hanya dipakai selama
  -- tagihan masih PENDING. Setelah itu (lunas / kedaluwarsa, > 1 hari) dibuang; data penting
  -- (gateway_provider, ref_id, nomor VA, dll.) tetap ada.
  update orders set payment_data = payment_data - 'qr_string' - 'qr_image' - 'tutorial_pembayaran'
   where status <> 'PENDING' and created_at < now() - interval '1 day'
     and (payment_data ? 'qr_string' or payment_data ? 'qr_image' or payment_data ? 'tutorial_pembayaran');
  get diagnostics f = row_count;
  update topups set payment_data = payment_data - 'qr_string' - 'qr_image' - 'tutorial_pembayaran'
   where status <> 'PENDING' and created_at < now() - interval '1 day'
     and (payment_data ? 'qr_string' or payment_data ? 'qr_image' or payment_data ? 'tutorial_pembayaran');
  get diagnostics g = row_count;

  -- Tagihan yang kedaluwarsa dan tidak pernah dibayar > 30 hari tidak berguna lagi
  delete from orders where status = 'EXPIRED' and created_at < now() - interval '30 days';
  get diagnostics h = row_count;
  delete from topups where status = 'EXPIRED' and created_at < now() - interval '30 days';
  get diagnostics i = row_count;

  return jsonb_build_object('topups_expired', a, 'rate_limits_purged', b, 'reset_purged', c,
                            'orders_expired', d, 'guest_users_purged', e,
                            'orders_trimmed', f, 'topups_trimmed', g,
                            'orders_purged', h, 'topups_purged', i);
end $$;

revoke all on function run_maintenance() from public, anon, authenticated;

-- Webhook top-up mencari baris lewat payment_data->>'ref_id' (wallet.ts). Tanpa index ini setiap webhook
-- memindai seluruh tabel topups; dengan index jadi pencarian langsung.
create index if not exists topups_ref_idx on topups ((payment_data->>'ref_id'));
