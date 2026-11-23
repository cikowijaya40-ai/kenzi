import type { Metadata } from 'next';
import { headers } from 'next/headers';
import SiteShell from '@/components/SiteShell';

export const metadata: Metadata = { title: 'Dokumentasi Reseller API', description: 'Dokumentasi Reseller API v1: katalog, saldo, order dengan Idempotency-Key, key dikirim langsung di respons.' };
export const dynamic = 'force-dynamic';   // base URL dibaca dari domain yang sedang dibuka

const Code = ({ children }: { children: string }) => (
    <pre style={{ background: '#0b1220', color: '#e6edf7', padding: 14, borderRadius: 12, overflowX: 'auto', fontSize: 12.5, lineHeight: 1.55, margin: '8px 0 14px' }}><code>{children}</code></pre>
);
const H = ({ children }: { children: React.ReactNode }) => <div className="sub-title">{children}</div>;
const Tag = ({ m }: { m: 'GET' | 'POST' }) => (
    <span style={{ background: m === 'GET' ? '#dbeafe' : '#dcfce7', color: m === 'GET' ? '#1d4ed8' : '#15803d', fontWeight: 800, fontSize: 11.5, padding: '2px 8px', borderRadius: 6, marginRight: 8 }}>{m}</span>
);
const P = ({ children }: { children: React.ReactNode }) => <p style={{ margin: '6px 0', fontSize: 14, lineHeight: 1.6 }}>{children}</p>;
const K = ({ children }: { children: React.ReactNode }) => <code style={{ background: '#eef4ff', padding: '1px 6px', borderRadius: 5, fontSize: 12.5 }}>{children}</code>;

const ERRORS: [string, string, string][] = [
    ['400', 'IDEMPOTENCY_REQUIRED', 'Header Idempotency-Key kosong atau lebih dari 100 karakter.'],
    ['400', 'DURATION_REQUIRED', 'sku kosong atau formatnya salah (harus <produk>.<angka><d|h|m>).'],
    ['400', 'INVALID_QTY', 'quantity bukan bilangan bulat 1 sampai 20.'],
    ['400', 'PRODUCT_MAINTENANCE', 'Produk sedang maintenance / tidak tersedia.'],
    ['400', 'INVALID_BODY / INVALID_TARGET', 'Body bukan JSON yang valid, atau target lebih dari 80 karakter.'],
    ['401', 'UNAUTHORIZED', 'API key kosong, formatnya salah, atau sudah diganti / dicabut.'],
    ['402', 'INSUFFICIENT_BALANCE', 'Saldo kurang. Pesan memuat jumlah yang dibutuhkan dan saldo kamu.'],
    ['403', 'FORBIDDEN', 'Akun bukan reseller aktif, atau API sedang dimatikan admin.'],
    ['404', 'UNKNOWN_SKU', 'SKU tidak ditemukan.'],
    ['404', 'NOT_FOUND', 'Endpoint atau order tidak ditemukan.'],
    ['409', 'BUSY', 'Stok kurang / habis. Saldo tidak dipotong.'],
    ['409', 'PURCHASE_PENDING', 'Masih ada order lain dari akun kamu yang sedang diproses. Coba lagi sebentar.'],
    ['422', 'IDEMPOTENCY_MISMATCH', 'Idempotency-Key yang sama dipakai untuk SKU yang berbeda.'],
    ['429', 'BUSY', 'Lebih dari 120 request per menit per key. Lihat header Retry-After.'],
    ['500', 'INTERNAL', 'Kesalahan di server. Ulangi dengan Idempotency-Key yang sama.'],
];

export default function Page() {
    const h = headers();
    const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3100';
    const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
    const BASE = `${proto}://${host}/api/v1`;

    const curlBasic = `curl ${BASE}/balance \\
  -H "Authorization: Bearer rk_live_KEY_KAMU"`;
    const curlOrder = `curl -X POST ${BASE}/orders \\
  -H "Authorization: Bearer rk_live_KEY_KAMU" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-0001" \\
  -d '{"sku":"drip.30d","quantity":1}'`;
    const node = `// Node.js 18+ (fetch & crypto bawaan)
const BASE = '${BASE}';
const KEY = process.env.RESELLER_API_KEY; // rk_live_...

async function call(path, { method = 'GET', body, idem } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      ...(idem ? { 'Idempotency-Key': idem } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error.message), { status: res.status, code: json.error.code });
  return json.data;
}

// Beli. Simpan idem SEBELUM request supaya bisa dipakai lagi kalau perlu mengulang.
async function buy(sku, quantity = 1, idem = crypto.randomUUID()) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await call('/orders', { method: 'POST', idem, body: { sku, quantity } });
    } catch (e) {
      const retryable = !e.status || e.status >= 500 || e.code === 'PURCHASE_PENDING' || e.status === 429;
      if (!retryable || attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));   // idem SAMA → tidak pernah memotong saldo dua kali
    }
  }
}

(async () => {
  console.log(await call('/balance'));
  const order = await buy('drip.30d', 1);
  console.log(order.status, order.keys);
})();`;

    return (
        <SiteShell>
            <div className="kx-wrap kx-dash" style={{ paddingBottom: 40 }}>
                <div className="kx-profile">
                    <div className="av"><i className="fa-solid fa-book" /></div>
                    <div style={{ minWidth: 0 }}><h1>Dokumentasi Reseller API v1</h1><small>Katalog per SKU, saldo wallet, order idempoten, key langsung di respons.</small></div>
                </div>

                <div className="panel" style={{ marginTop: 14 }}>
                    <H>Mulai</H>
                    <P><b>Base URL:</b> <K>{BASE}</K></P>
                    <P>1. Jadi reseller di <a href="/reseller" style={{ textDecoration: 'underline' }}>/reseller</a>. 2. Buka <a href="/reseller/api" style={{ textDecoration: 'underline' }}>/reseller/api</a> lalu klik <b>Buat API key</b> (key hanya tampil sekali). 3. Isi saldo, lalu kirim header <K>Authorization: Bearer rk_live_...</K> di setiap request.</P>
                    <P>Semua respons JSON. Sukses: <K>{'{ "data": ... }'}</K>. Gagal: <K>{'{ "error": { "code": "...", "message": "..." } }'}</K>. Uang dalam Rupiah bilangan bulat, <K>currency: "IDR"</K>. Batas 120 request per menit per key.</P>
                    <Code>{curlBasic}</Code>
                </div>

                <div className="panel" style={{ marginTop: 14 }}>
                    <H>Endpoint</H>

                    <P><Tag m="GET" /><b>/me</b>: info akun.</P>
                    <Code>{`{ "data": { "username": "budi", "role": "RESELLER", "currency": "IDR", "keyPrefix": "rk_live_ab12…f9e0", "rateLimitRpm": 120, "maxQuantity": 20 } }`}</Code>

                    <P><Tag m="GET" /><b>/balance</b>: saldo terbaru.</P>
                    <Code>{`{ "data": { "balance": 150000, "currency": "IDR" } }`}</Code>

                    <P><Tag m="GET" /><b>/products</b>: katalog datar, 1 item = 1 produk + 1 durasi. <K>price</K> adalah harga reseller (produk yang tidak masuk program harga reseller memakai harga normal). <K>stock</K> bernilai <K>null</K> karena stok key live dari penyedia; pakai <K>inStock</K>.</P>
                    <Code>{`{ "data": { "currency": "IDR", "priceTier": "reseller", "items": [
  { "apiCode": "drip.30d", "name": "DRIP - 30 Hari", "product": "DRIP", "productApiCode": "drip",
    "category": "android", "label": "30 Hari", "days": 30, "unit": "d", "price": 120000, "currency": "IDR",
    "stock": null, "inStock": true, "is_maintenance": false } ] } }`}</Code>
                    <P><K>apiCode</K> (SKU) berformat <K>{'<produk>.<angka><unit>'}</K>, unit <K>d</K> hari, <K>h</K> jam, <K>m</K> menit. Contoh <K>drip.30d</K>.</P>

                    <P><Tag m="GET" /><b>/stock?sku=drip.30d</b>: cek satu SKU.</P>
                    <Code>{`{ "data": { "apiCode": "drip.30d", "stock": null, "inStock": true, "is_maintenance": false } }`}</Code>

                    <P><Tag m="POST" /><b>/orders</b>: beli. Header <K>Idempotency-Key</K> wajib (maks 100 karakter).</P>
                    <Code>{curlOrder}</Code>
                    <P>Body: <K>sku</K> (wajib), <K>quantity</K> (bulat 1–20, bawaan 1), <K>target</K> (opsional, teks maks 80 karakter).</P>
                    <Code>{`{ "data": { "id": "6f1c...", "code": "INV-12345678-AB12C", "status": "FULFILLED", "sku": "drip.30d",
  "quantity": 1, "price": 120000, "unitPrice": 120000, "currency": "IDR",
  "keys": ["XXXX-XXXX-XXXX"], "balance": 30000, "createdAt": "2026-11-21T08:00:00.000Z" } }`}</Code>
                    <P><K>status</K> adalah <K>FULFILLED</K> (semua key terkirim) atau <K>PARTIAL</K> (key terkirim kurang dari <K>quantity</K>; hanya yang terkirim ditagih, sisanya otomatis dikembalikan ke saldo, dan <K>price</K> sudah berupa jumlah yang ditagih).</P>

                    <P><Tag m="GET" /><b>/orders?page=1&amp;limit=20</b>: riwayat order API milikmu, terbaru dulu (limit 1–50). Key tidak ikut ditampilkan di daftar.</P>
                    <Code>{`{ "data": { "page": 1, "limit": 20, "total": 1, "hasMore": false,
  "items": [ { "id": "6f1c...", "code": "INV-12345678-AB12C", "status": "FULFILLED", "sku": "drip.30d",
               "quantity": 1, "price": 120000, "keysCount": 1, "createdAt": "2026-11-21T08:00:00.000Z" } ] } }`}</Code>

                    <P><Tag m="GET" /><b>/orders/:id</b>: detail lengkap dengan <K>keys</K>. <K>:id</K> boleh <K>id</K> atau <K>code</K>.</P>
                </div>

                <div className="panel" style={{ marginTop: 14 }}>
                    <H>Idempotency-Key &amp; retry aman</H>
                    <P>Buat satu <K>Idempotency-Key</K> unik per niat membeli (misalnya UUID) dan simpan sebelum mengirim request. Kalau koneksi putus atau kamu tidak yakin order masuk, kirim ulang <b>dengan key yang sama</b>: kamu mendapat order yang sama dan saldo tidak dipotong lagi. Key sama tetapi SKU berbeda ditolak (<K>422 IDEMPOTENCY_MISMATCH</K>).</P>
                    <P>Aman diulang dengan key yang sama: error jaringan / timeout, <K>500 INTERNAL</K>, <K>409 PURCHASE_PENDING</K>, <K>429</K>. Jangan diulang: <K>400</K>, <K>401</K>, <K>402</K>, <K>403</K>, <K>404</K>, <K>422</K>. Kalau order gagal karena stok (<K>409 BUSY</K>), saldo dikembalikan dan key itu ikut tercatat gagal; untuk mencoba lagi nanti pakai Idempotency-Key baru.</P>
                    <P>Satu reseller hanya bisa memproses satu order dalam satu waktu; order kedua yang bersamaan mendapat <K>409 PURCHASE_PENDING</K>.</P>
                </div>

                <div className="panel" style={{ marginTop: 14 }}>
                    <H>Contoh Node.js</H>
                    <Code>{node}</Code>
                </div>

                <div className="panel" style={{ marginTop: 14 }}>
                    <H>Kode error</H>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}><th style={{ padding: '6px 8px' }}>HTTP</th><th style={{ padding: '6px 8px' }}>code</th><th style={{ padding: '6px 8px' }}>Arti</th></tr></thead>
                            <tbody>{ERRORS.map(([s, c, m]) => (
                                <tr key={s + c} style={{ borderBottom: '1px solid var(--line)' }}><td style={{ padding: '6px 8px' }}>{s}</td><td style={{ padding: '6px 8px' }}><code>{c}</code></td><td style={{ padding: '6px 8px' }}>{m}</td></tr>
                            ))}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </SiteShell>
    );
}
