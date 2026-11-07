-- =====================================================================
-- KENZIxCheat — SKEMA DATABASE AMAN (Supabase / PostgreSQL)
-- Jalankan SEKALI di: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Aman dijalankan ulang (idempotent) dan aman untuk database lama.
--
-- PRINSIP KEAMANAN
--  1. RLS aktif di SEMUA tabel dan TIDAK ADA policy untuk anon/authenticated.
--     Artinya anon key (yang publik) tidak bisa baca/tulis apa pun.
--     Hanya server (SUPABASE_SERVICE_ROLE_KEY, rahasia di Vercel) yang bisa akses.
--  2. Saldo hanya berubah lewat fungsi SQL atomik (row lock) — tidak ada
--     double-credit, tidak ada saldo minus, tidak ada race condition.
--  3. Setiap mutasi saldo tercatat di wallet_ledger (audit trail, idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 0. BUANG SEMUA POLICY LAMA ("Public full access", dll) ----------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------- 1. TABEL KATALOG (kompatibel dengan skema lama) ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  slug varchar(100) unique not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug varchar(100) unique not null,
  name varchar(150) not null,
  publisher varchar(100) default 'Garena',
  category_slug varchar(100) default 'games',
  icon_url text not null default '',
  banner_url text,
  description text,
  badge varchar(50) default 'POPULER',
  input_label_1 varchar(100) default 'Android ID / User ID',
  input_placeholder_1 varchar(100) default 'Masukkan ID',
  input_label_2 varchar(100) default 'Zone / Server ID',
  input_placeholder_2 varchar(100) default 'Masukkan Server ID',
  has_zone_id boolean default false,
  is_active boolean default true,
  is_featured boolean default true,
  maintenance boolean not null default false,
  maintenance_note text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- Instalasi lama: tambahkan kolom maintenance (aman dijalankan ulang)
alter table products add column if not exists maintenance boolean not null default false;
alter table products add column if not exists maintenance_note text;

create table if not exists product_items (
  id uuid primary key default gen_random_uuid(),
  product_slug varchar(100) not null,
  sku varchar(100) not null,
  name varchar(150) not null,
  original_price numeric(12,2) not null,
  price numeric(12,2) not null,
  cost_usd varchar(50) default '0.00',
  icon_url text,
  badge varchar(50),
  is_active boolean default true,
  sort_order int default 0,
  stock int default 999,
  in_stock boolean default true,
  created_at timestamptz default now(),
  constraint product_items_slug_sku_unique unique (product_slug, sku)
);

create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) unique not null,
  name varchar(100) not null,
  group_name varchar(50) not null,
  image_url text not null default '',
  fee_amount numeric(12,2) default 0,
  fee_percent numeric(5,2) default 0,
  min_trx numeric(12,2) default 1000,
  max_trx numeric(12,2) default 10000000,
  type_fee varchar(20) default 'customer',
  tutorial_pembayaran text,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists site_settings (
  key varchar(100) primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- ---------- 2. PENGGUNA & SALDO ----------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  email text not null,
  password_hash text not null,
  whatsapp text,
  balance bigint not null default 0 check (balance >= 0),
  is_banned boolean not null default false,
  token_version int not null default 0,       -- naikkan untuk logout semua sesi
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table users add column if not exists auto_created boolean not null default false;  -- dibuat otomatis saat guest checkout
alter table users add column if not exists init_cred text;                              -- kredensial awal (terenkripsi), dihapus saat user ganti password/username
create unique index if not exists users_username_lower_uq on users (lower(username));
create unique index if not exists users_email_lower_uq on users (lower(email));

create table if not exists wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('topup','purchase','refund','admin_adjust')),
  amount bigint not null,                      -- bertanda: + masuk, - keluar
  balance_after bigint not null,
  ref text not null,                           -- invoice / id unik (idempotency)
  note text,
  created_at timestamptz not null default now(),
  unique (kind, ref)
);
create index if not exists wallet_ledger_user_idx on wallet_ledger (user_id, id desc);

create table if not exists topups (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique not null,
  user_id uuid not null references users(id) on delete cascade,
  amount bigint not null check (amount > 0),   -- saldo yang masuk
  fee bigint not null default 0,
  total_amount bigint not null,                -- yang dibayar buyer (amount + fee)
  gateway text,
  payment_method text,
  payment_name text,
  payment_data jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING','PAID','EXPIRED','FAILED','CANCELLED')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists topups_user_idx on topups (user_id, created_at desc);
create index if not exists topups_status_idx on topups (status, created_at);
create index if not exists topups_ref_idx on topups ((payment_data->>'ref_id'));

-- ---------- 3. PESANAN ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  invoice_no varchar(100) unique not null,
  ref_id varchar(100) unique not null,
  product_slug varchar(100) not null,
  product_name varchar(150) not null,
  item_sku varchar(100) not null,
  item_name varchar(150) not null,
  user_id_game varchar(100) not null default '-',
  zone_id varchar(100),
  user_whatsapp varchar(50) not null default '-',
  customer_email varchar(100),
  amount numeric(12,2) not null,
  fee numeric(12,2) default 0,
  total_amount numeric(12,2) not null,
  payment_method varchar(50) not null default 'SALDO',
  payment_name varchar(100) not null default 'Saldo Akun',
  payment_data jsonb default '{}'::jsonb,
  status varchar(50) default 'PENDING',
  delivery_status varchar(50) default 'PENDING',
  delivery_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table orders add column if not exists user_id uuid references users(id) on delete set null;
create index if not exists orders_user_idx on orders (user_id, created_at desc);
create index if not exists orders_status_idx on orders (status, created_at desc);
create index if not exists idx_product_items_slug on product_items (product_slug);
create index if not exists idx_products_active on products (is_active, sort_order);

-- ---------- 4. ADMIN (password di-hash, bukan di site_settings lagi) ----------
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  email text,
  token_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists admin_users_username_lower_uq on admin_users (lower(username));

create table if not exists admin_reset_requests (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admin_users(id) on delete cascade,
  token_hash text not null,                    -- sha256 dari token; token asli tidak disimpan
  expires_at timestamptz not null,
  used_at timestamptz,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists admin_reset_idx on admin_reset_requests (token_hash);

-- ---------- 5. RATE LIMIT (anti brute-force) ----------
create table if not exists rate_limits (
  key text primary key,
  hits int not null default 0,
  reset_at timestamptz not null
);

-- ---------- 6. KUNCI SEMUA TABEL: RLS ON + TANPA POLICY + CABUT AKSES PUBLIK ----------
do $$
declare t text;
begin
  foreach t in array array[
    'categories','products','product_items','payment_methods','site_settings',
    'users','wallet_ledger','topups','orders','admin_users','admin_reset_requests','rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- ---------- 7. FUNGSI ATOMIK (hanya service_role yang boleh eksekusi) ----------

-- 7a. Rate limit atomik. allowed=false jika melewati batas.
create or replace function rate_limit_hit(p_key text, p_max int, p_window int)
returns table (allowed boolean, remaining int, retry_after int)
language plpgsql security definer set search_path = public as $$
declare r rate_limits%rowtype;
begin
  insert into rate_limits as rl (key, hits, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window))
  on conflict (key) do update set
    hits = case when rl.reset_at <= now() then 1 else rl.hits + 1 end,
    reset_at = case when rl.reset_at <= now() then now() + make_interval(secs => p_window) else rl.reset_at end
  returning * into r;
  return query select (r.hits <= p_max), greatest(p_max - r.hits, 0),
                      greatest(extract(epoch from (r.reset_at - now()))::int, 0);
end $$;

-- 7b. Kreditkan top-up yang sudah dibayar. IDEMPOTENT: panggil berapa kali pun, saldo masuk sekali.
create or replace function settle_topup(p_invoice text)
returns table (ok boolean, status text, user_id uuid, credited bigint, new_balance bigint)
language plpgsql security definer set search_path = public as $$
declare t topups%rowtype; nb bigint;
begin
  select * into t from topups where invoice_no = p_invoice for update;
  if not found then
    return query select false, 'NOT_FOUND'::text, null::uuid, 0::bigint, 0::bigint; return;
  end if;
  if t.status = 'PAID' then
    select balance into nb from users where id = t.user_id;
    return query select true, 'ALREADY_PAID'::text, t.user_id, 0::bigint, nb; return;
  end if;
  update users set balance = balance + t.amount where id = t.user_id returning balance into nb;
  insert into wallet_ledger (user_id, kind, amount, balance_after, ref, note)
  values (t.user_id, 'topup', t.amount, nb, t.invoice_no, 'Top up saldo via ' || coalesce(t.payment_name, 'gateway'))
  on conflict (kind, ref) do nothing;
  update topups set status = 'PAID', paid_at = now() where id = t.id;
  return query select true, 'PAID'::text, t.user_id, t.amount, nb;
end $$;

-- 7c. Beli produk dengan saldo. Harga dibaca dari DB (server-authoritative), bukan dari klien.
create or replace function purchase_item(
  p_user uuid, p_slug text, p_sku text, p_invoice text, p_ref text,
  p_game_id text, p_zone text, p_whatsapp text, p_email text)
returns orders
language plpgsql security definer set search_path = public as $$
declare u users%rowtype; pr products%rowtype; it product_items%rowtype;
        price bigint; nb bigint; o orders%rowtype;
begin
  select * into u from users where id = p_user for update;
  if not found or u.is_banned then raise exception 'USER_INVALID'; end if;

  select * into pr from products where slug = p_slug and coalesce(is_active, true);
  if not found then raise exception 'ITEM_UNAVAILABLE'; end if;

  select * into it from product_items
   where product_slug = p_slug and sku = p_sku and coalesce(is_active, true)
     and coalesce(in_stock, true) and coalesce(stock, 999) > 0
   for update;
  if not found then raise exception 'ITEM_UNAVAILABLE'; end if;

  price := round(it.price)::bigint;
  if price <= 0 then raise exception 'ITEM_UNAVAILABLE'; end if;
  if u.balance < price then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update users set balance = balance - price where id = p_user returning balance into nb;
  update product_items
     set stock = greatest(coalesce(stock, 999) - 1, 0),
         in_stock = (coalesce(stock, 999) - 1) > 0
   where id = it.id;

  insert into orders (invoice_no, ref_id, product_slug, product_name, item_sku, item_name,
                      user_id_game, zone_id, user_whatsapp, customer_email,
                      amount, fee, total_amount, payment_method, payment_name,
                      status, delivery_status, user_id)
  values (p_invoice, p_ref, pr.slug, pr.name, it.sku, it.name,
          coalesce(nullif(p_game_id, ''), '-'), p_zone, coalesce(nullif(p_whatsapp, ''), '-'), p_email,
          price, 0, price, 'SALDO', 'Saldo Akun', 'PAID', 'PENDING', p_user)
  returning * into o;

  insert into wallet_ledger (user_id, kind, amount, balance_after, ref, note)
  values (p_user, 'purchase', -price, nb, p_invoice, pr.name || ' — ' || it.name);
  return o;
end $$;

-- 7d. Refund otomatis bila pengiriman lisensi gagal. IDEMPOTENT.
create or replace function refund_order(p_invoice text, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; nb bigint; amt bigint;
begin
  select * into o from orders where invoice_no = p_invoice for update;
  if not found or o.user_id is null then return false; end if;
  if o.status <> 'PAID' or o.delivery_status = 'DELIVERED' then return false; end if;
  amt := round(o.total_amount)::bigint;
  update users set balance = balance + amt where id = o.user_id returning balance into nb;
  update product_items set stock = coalesce(stock, 0) + 1, in_stock = true
   where product_slug = o.product_slug and sku = o.item_sku;
  update orders set status = 'FAILED', delivery_status = 'FAILED', updated_at = now(),
         delivery_data = coalesce(delivery_data, '{}'::jsonb) || jsonb_build_object('refund_reason', p_reason)
   where id = o.id;
  insert into wallet_ledger (user_id, kind, amount, balance_after, ref, note)
  values (o.user_id, 'refund', amt, nb, p_invoice, 'Refund: ' || coalesce(p_reason, 'pengiriman gagal'))
  on conflict (kind, ref) do nothing;
  return true;
end $$;

-- 7e. Penyesuaian saldo manual oleh admin (tambah / kurangi). Tidak boleh jadi minus.
create or replace function admin_adjust_balance(p_user uuid, p_delta bigint, p_note text, p_admin text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare nb bigint;
begin
  if p_delta = 0 then raise exception 'DELTA_ZERO'; end if;
  perform 1 from users where id = p_user for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  update users set balance = balance + p_delta where id = p_user returning balance into nb;
  if nb < 0 then raise exception 'INSUFFICIENT_BALANCE'; end if;
  insert into wallet_ledger (user_id, kind, amount, balance_after, ref, note)
  values (p_user, 'admin_adjust', p_delta, nb, 'ADJ-' || gen_random_uuid()::text,
          coalesce(p_note, 'Penyesuaian admin') || ' (oleh ' || coalesce(p_admin, 'admin') || ')');
  return nb;
end $$;

-- 7g. Tandai pesanan lunas secara ATOMIK & IDEMPOTENT.
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

-- 7f (versi baru). Perawatan harian: kadaluarsakan pesanan QRIS yang tak dibayar & bersihkan akun otomatis yang tak pernah beli
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


-- Hanya service_role yang boleh menjalankan fungsi-fungsi di atas
revoke all on function rate_limit_hit(text,int,int), settle_topup(text),
  purchase_item(uuid,text,text,text,text,text,text,text,text),
  refund_order(text,text), admin_adjust_balance(uuid,bigint,text,text), run_maintenance(), mark_order_paid(text)
  from public, anon, authenticated;
grant execute on function rate_limit_hit(text,int,int), settle_topup(text),
  purchase_item(uuid,text,text,text,text,text,text,text,text),
  refund_order(text,text), admin_adjust_balance(uuid,bigint,text,text), run_maintenance(), mark_order_paid(text)
  to service_role;

-- ---------- 8. BERSIHKAN KREDENSIAL ADMIN LAMA DARI site_settings ----------
update site_settings
   set value = value - 'admin_password' - 'admin_pin' - 'admin_username'
                     - 'supabase_url' - 'supabase_anon_key' - 'supabase_service_key'
 where key = 'main_config';
