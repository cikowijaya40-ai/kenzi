-- =====================================================================
-- MIGRASI: Mode Maintenance per produk
-- Jalankan SEKALI di Supabase -> SQL Editor. Aman dijalankan ulang.
-- (Sudah otomatis ikut di supabase/schema.sql untuk instalasi baru.)
--
-- Produk yang sedang maintenance TETAP tampil di katalog, tetapi tombol
-- beli dinonaktifkan & checkout ditolak di server. Pesanan yang sudah
-- dibayar sebelum maintenance tetap diproses normal.
-- =====================================================================
alter table products add column if not exists maintenance boolean not null default false;
alter table products add column if not exists maintenance_note text;

-- Muat ulang schema cache PostgREST agar kolom baru langsung terbaca API
notify pgrst, 'reload schema';
