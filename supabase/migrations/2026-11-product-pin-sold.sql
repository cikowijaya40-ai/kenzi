-- =====================================================================
-- MIGRASI: Pin produk ke atas + label "Terlaris" + jumlah terjual
-- Jalankan SEKALI di Supabase -> SQL Editor. Aman dijalankan ulang.
-- (Sudah otomatis ikut di supabase/schema.sql untuk instalasi baru.)
--
--  pinned           : produk disematkan, selalu tampil paling atas di katalog
--  sold_offset      : tambahan jumlah terjual manual (ditambah ke penjualan asli)
--  show_sold        : tampilkan / sembunyikan jumlah terjual di kartu produk
--  bestseller_mode  : 'auto' (top penjualan) | 'on' (selalu Terlaris) | 'off' (tidak pernah)
-- =====================================================================
alter table products add column if not exists pinned boolean not null default false;
alter table products add column if not exists sold_offset int not null default 0;
alter table products add column if not exists show_sold boolean not null default true;
alter table products add column if not exists bestseller_mode text not null default 'auto';

-- Penjualan asli per produk = jumlah pesanan lunas. Satu query agregat (di-cache 5 menit oleh aplikasi).
create or replace function product_sales_counts()
returns table (product_slug text, sold bigint)
language sql stable security definer set search_path = public as $$
  select o.product_slug::text, count(*)::bigint
    from orders o
   where o.status in ('PAID', 'DELIVERED')
   group by o.product_slug;
$$;
revoke all on function product_sales_counts() from public, anon, authenticated;

-- Index parsial agar penghitungan di atas cepat walau pesanan sudah banyak
create index if not exists orders_paid_slug_idx on orders (product_slug) where status in ('PAID', 'DELIVERED');

-- Muat ulang schema cache PostgREST agar kolom & fungsi baru langsung terbaca API
notify pgrst, 'reload schema';
