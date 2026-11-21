-- =====================================================================
-- OPEN RESELLER + RESELLER API v1
-- Jalankan SEKALI di Supabase -> SQL Editor. Aman dijalankan ulang (idempotent).
-- Syarat: schema.sql utama sudah pernah dijalankan.
--
-- Prinsip sama dengan fitur saldo yang sudah ada:
--  * RLS aktif, tanpa policy -> hanya server (service_role) yang bisa akses.
--  * Saldo hanya berubah lewat fungsi SQL atomik (row lock), semua tercatat di wallet_ledger.
--  * Order API idempotent di level database (unique user_id + Idempotency-Key).
-- =====================================================================

-- ---------- 1. KOLOM BARU ----------
alter table users add column if not exists is_reseller boolean not null default false;
alter table users add column if not exists reseller_disabled boolean not null default false;   -- dinonaktifkan admin (tidak perlu bayar ulang saat diaktifkan lagi)
alter table users add column if not exists reseller_since timestamptz;
alter table users add column if not exists api_key_hash text;          -- SHA-256 dari API key. Key utuh TIDAK pernah disimpan.
alter table users add column if not exists api_key_prefix text;        -- untuk tampilan, mis. rk_live_ab12…f9e0
alter table users add column if not exists api_key_created_at timestamptz;
create unique index if not exists users_api_key_hash_uq on users (api_key_hash) where api_key_hash is not null;

alter table product_items add column if not exists reseller_price numeric(12,2);   -- kosong = pakai diskon global reseller

alter table orders add column if not exists source text not null default 'web';    -- 'web' | 'api'
alter table orders add column if not exists quantity int not null default 1;
alter table orders add column if not exists unit_price numeric(12,2);
alter table orders add column if not exists api_idem text;                          -- Idempotency-Key dari reseller
alter table orders add column if not exists api_sku text;                           -- SKU API yang dipesan
create unique index if not exists orders_api_idem_uq on orders (user_id, api_idem) where api_idem is not null;
create index if not exists orders_api_user_idx on orders (user_id, created_at desc) where source = 'api';

-- jenis mutasi baru: biaya bergabung reseller
alter table wallet_ledger drop constraint if exists wallet_ledger_kind_check;
alter table wallet_ledger add constraint wallet_ledger_kind_check
  check (kind in ('topup','purchase','refund','admin_adjust','reseller_fee'));

-- kunci "satu order per reseller sekaligus" (aman untuk serverless / banyak instance)
create table if not exists api_locks (
  user_id uuid primary key references users(id) on delete cascade,
  token text not null,
  until_at timestamptz not null
);
alter table api_locks enable row level security;
revoke all on table api_locks from anon, authenticated;

-- ---------- 2. FUNGSI ATOMIK ----------

-- 2a. Daftar reseller: potong biaya dari saldo + set is_reseller, dalam SATU transaksi.
create or replace function reseller_join(p_user uuid, p_fee bigint, p_invoice text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare u users%rowtype; nb bigint;
begin
  select * into u from users where id = p_user for update;
  if not found or u.is_banned then raise exception 'USER_INVALID'; end if;
  if u.is_reseller then raise exception 'ALREADY_RESELLER'; end if;
  if p_fee < 0 then raise exception 'FEE_INVALID'; end if;
  if u.balance < p_fee then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update users set balance = balance - p_fee, is_reseller = true, reseller_since = now()
   where id = p_user returning balance into nb;
  if p_fee > 0 then
    insert into wallet_ledger (user_id, kind, amount, balance_after, ref, note)
    values (p_user, 'reseller_fee', -p_fee, nb, p_invoice, 'Biaya bergabung Open Reseller');
  end if;
  return nb;
end $$;

-- 2b. Kunci per reseller. true = kunci didapat. Kunci kedaluwarsa sendiri setelah p_secs detik.
create or replace function api_lock_acquire(p_user uuid, p_token text, p_secs int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into api_locks as l (user_id, token, until_at)
  values (p_user, p_token, now() + make_interval(secs => p_secs))
  on conflict (user_id) do update set token = excluded.token, until_at = excluded.until_at
    where l.until_at <= now();
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function api_lock_release(p_user uuid, p_token text)
returns void
language sql security definer set search_path = public as $$
  delete from api_locks where user_id = p_user and token = p_token;
$$;

-- 2c. Mulai order API: validasi, potong saldo PENUH di muka, kurangi stok, catat order + mutasi.
--     Idempotent: Idempotency-Key yang sama untuk reseller yang sama mengembalikan order lama TANPA memotong lagi.
--     Selisih (kalau key yang terkirim kurang dari yang dipesan) dikembalikan oleh api_order_finish.
create or replace function api_order_begin(
  p_user uuid, p_idem text, p_sku_code text, p_slug text, p_item_sku text,
  p_qty int, p_unit bigint, p_invoice text, p_ref text, p_target text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare u users%rowtype; pr products%rowtype; it product_items%rowtype; o orders%rowtype;
        total bigint; nb bigint;
begin
  select * into u from users where id = p_user for update;     -- serialisasi per reseller
  if not found or u.is_banned or not u.is_reseller or u.reseller_disabled then raise exception 'FORBIDDEN'; end if;

  select * into o from orders where user_id = p_user and api_idem = p_idem;
  if found then
    if o.api_sku is distinct from p_sku_code then raise exception 'IDEMPOTENCY_MISMATCH'; end if;
    return jsonb_build_object('created', false, 'invoice_no', o.invoice_no);
  end if;

  if p_qty < 1 or p_qty > 20 or p_unit <= 0 then raise exception 'INVALID_QTY'; end if;

  select * into pr from products where slug = p_slug and coalesce(is_active, true);
  if not found then raise exception 'UNKNOWN_SKU'; end if;
  if coalesce(pr.maintenance, false) then raise exception 'PRODUCT_MAINTENANCE'; end if;

  select * into it from product_items
   where product_slug = p_slug and sku = p_item_sku and coalesce(is_active, true) for update;
  if not found then raise exception 'UNKNOWN_SKU'; end if;
  if not coalesce(it.in_stock, true) or coalesce(it.stock, 999) < p_qty then raise exception 'BUSY'; end if;

  total := p_unit * p_qty;
  if u.balance < total then
    raise exception 'INSUFFICIENT_BALANCE % %', total, u.balance;
  end if;

  update users set balance = balance - total where id = p_user returning balance into nb;
  update product_items
     set stock = greatest(coalesce(stock, 999) - p_qty, 0),
         in_stock = (coalesce(stock, 999) - p_qty) > 0
   where id = it.id;

  insert into orders (invoice_no, ref_id, product_slug, product_name, item_sku, item_name,
                      user_id_game, zone_id, user_whatsapp, customer_email,
                      amount, fee, total_amount, payment_method, payment_name,
                      status, delivery_status, user_id, source, quantity, unit_price, api_idem, api_sku)
  values (p_invoice, p_ref, pr.slug, pr.name, it.sku, it.name,
          coalesce(nullif(p_target, ''), '-'), null, '-', u.email,
          total, 0, total, 'SALDO', 'Saldo Akun (API)',
          'PAID', 'PENDING', p_user, 'api', p_qty, p_unit, p_idem, p_sku_code);

  insert into wallet_ledger (user_id, kind, amount, balance_after, ref, note)
  values (p_user, 'purchase', -total, nb, p_invoice, 'API: ' || pr.name || ' — ' || it.name || ' x' || p_qty);

  return jsonb_build_object('created', true, 'invoice_no', p_invoice, 'balance', nb);
end $$;

-- 2d. Selesaikan order API setelah key diambil dari provider. IDEMPOTENT.
--     0 key  -> refund penuh, order FAILED.
--     < qty  -> PARTIAL: hanya yang terkirim ditagih (round(total * dapat / qty)), sisanya dikembalikan.
--     p_soldout = true bila provider melaporkan stok habis: opsi tetap ditandai habis (tidak dinyalakan lagi).
create or replace function api_order_finish(p_invoice text, p_keys text[], p_reason text, p_soldout boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; got int; qty int; total bigint; charge bigint; refund bigint; nb bigint; keys text[];
begin
  select * into o from orders where invoice_no = p_invoice and source = 'api' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select balance into nb from users where id = o.user_id for update;

  if o.delivery_status in ('DELIVERED', 'FAILED') then
    return jsonb_build_object('done', false, 'invoice_no', o.invoice_no, 'balance', nb);   -- sudah diselesaikan sebelumnya
  end if;

  qty := o.quantity;
  total := round(o.total_amount)::bigint;
  keys := coalesce(p_keys, '{}'::text[]);
  got := least(coalesce(array_length(keys, 1), 0), qty);
  if got < coalesce(array_length(keys, 1), 0) then keys := keys[1:got]; end if;

  if got = 0 then charge := 0; else charge := round(total::numeric * got / qty)::bigint; end if;
  refund := total - charge;

  if refund > 0 then
    update users set balance = balance + refund where id = o.user_id returning balance into nb;
    insert into wallet_ledger (user_id, kind, amount, balance_after, ref, note)
    values (o.user_id, 'refund', refund, nb, o.invoice_no,
            case when got = 0 then 'Refund: ' || coalesce(nullif(p_reason, ''), 'key tidak tersedia')
                 else 'Refund sebagian: ' || got || ' dari ' || qty || ' key terkirim' end)
    on conflict (kind, ref) do nothing;
  end if;

  if qty - got > 0 and not coalesce(p_soldout, false) then
    update product_items set stock = coalesce(stock, 0) + (qty - got), in_stock = (coalesce(stock, 0) + (qty - got)) > 0
     where product_slug = o.product_slug and sku = o.item_sku;
  end if;

  update orders
     set status = case when got = 0 then 'FAILED' else 'PAID' end,
         delivery_status = case when got = 0 then 'FAILED' else 'DELIVERED' end,
         amount = charge, total_amount = charge, updated_at = now(),
         delivery_data = case when got = 0
           then jsonb_build_object('refund_reason', left(coalesce(p_reason, ''), 200), 'requested', qty, 'delivered', 0)
           else jsonb_build_object('license_key', keys[1], 'keys', to_jsonb(keys), 'provider', 'thanhub',
                                   'delivered_at', now(), 'requested', qty, 'delivered', got, 'partial', got < qty) end
   where id = o.id;

  return jsonb_build_object('done', true, 'invoice_no', o.invoice_no, 'balance', nb, 'charged', charge, 'refunded', refund, 'delivered', got);
end $$;

-- ---------- 3. HAK AKSES: hanya service_role ----------
revoke all on function reseller_join(uuid,bigint,text), api_lock_acquire(uuid,text,int), api_lock_release(uuid,text),
  api_order_begin(uuid,text,text,text,text,int,bigint,text,text,text), api_order_finish(text,text[],text,boolean)
  from public, anon, authenticated;
grant execute on function reseller_join(uuid,bigint,text), api_lock_acquire(uuid,text,int), api_lock_release(uuid,text),
  api_order_begin(uuid,text,text,text,text,int,bigint,text,text,text), api_order_finish(text,text[],text,boolean)
  to service_role;
