-- =====================================================================
-- HARGA RESELLER DI WEB (beli lewat saldo dengan harga reseller)
-- Otomatis diterapkan saat build (scripts/migrate.js), atau jalankan manual sekali. Aman diulang.
-- Syarat: 2026-11-open-reseller.sql sudah diterapkan (kolom users.is_reseller).
--
-- purchase_item (yang lama) TIDAK diubah. Fungsi baru ini sama persis, tetapi harganya dikirim server
-- (p_price) dan DIVALIDASI di database:
--   * harus > 0 dan tidak boleh lebih mahal dari harga normal item;
--   * harga di bawah harga normal HANYA boleh untuk reseller aktif (bukan reseller -> FORBIDDEN_PRICE).
-- Jadi walau ada bug di kode aplikasi, user biasa tidak bisa membeli dengan harga murah.
-- =====================================================================
create or replace function purchase_item_priced(
  p_user uuid, p_slug text, p_sku text, p_invoice text, p_ref text,
  p_game_id text, p_zone text, p_whatsapp text, p_email text, p_price bigint)
returns orders
language plpgsql security definer set search_path = public as $$
declare u users%rowtype; pr products%rowtype; it product_items%rowtype;
        price bigint; pub bigint; nb bigint; o orders%rowtype;
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

  pub := round(it.price)::bigint;
  price := p_price;
  if price <= 0 or price > pub then raise exception 'ITEM_UNAVAILABLE'; end if;
  if price < pub and not (u.is_reseller and not u.reseller_disabled) then raise exception 'FORBIDDEN_PRICE'; end if;
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
          price, 0, price, 'SALDO', case when price < pub then 'Saldo Akun (Harga Reseller)' else 'Saldo Akun' end, 'PAID', 'PENDING', p_user)
  returning * into o;

  insert into wallet_ledger (user_id, kind, amount, balance_after, ref, note)
  values (p_user, 'purchase', -price, nb, p_invoice, pr.name || ' — ' || it.name || case when price < pub then ' (harga reseller)' else '' end);
  return o;
end $$;

revoke all on function purchase_item_priced(uuid,text,text,text,text,text,text,text,text,bigint) from public, anon, authenticated;
grant execute on function purchase_item_priced(uuid,text,text,text,text,text,text,text,text,bigint) to service_role;
