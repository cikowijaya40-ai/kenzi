/**
 * MIGRASI OTOMATIS saat build (npm run build -> prebuild).
 * Menerapkan SQL di supabase/migrations yang terdaftar di MIGRATIONS ke database, SEKALI saja
 * (dicatat di tabel app_migrations). Aman dijalankan berulang di setiap deploy.
 *
 * Butuh 1 environment variable di Vercel (URL koneksi Postgres Supabase):
 *   DATABASE_URL = postgresql://postgres.xxxx:PASSWORD@aws-0-xxx.pooler.supabase.com:5432/postgres
 *   (Supabase -> Project Settings -> Database -> Connection string -> URI; pakai yang "Session pooler"/"Direct")
 * Integrasi Vercel-Supabase yang sudah memberi POSTGRES_URL / POSTGRES_URL_NON_POOLING juga otomatis dipakai.
 *
 * Perilaku:
 *  - URL tidak ada / tidak terjangkau  -> peringatan, build lanjut (aplikasi tetap jalan; fitur baru belum aktif).
 *  - SQL error                         -> build GAGAL (versi lama tetap live), pesan error jelas.
 *  - SKIP_DB_MIGRATE=1                 -> lewati.
 */
const fs = require('fs');
const path = require('path');

// Urutan penting: yang kedua memakai kolom dari yang pertama.
const MIGRATIONS = ['2026-11-open-reseller.sql', '2026-11-reseller-web-price.sql'];

const tag = '[migrate]';
const log = (m) => console.log(`${tag} ${m}`);
const warn = (m) => console.warn(`${tag} PERINGATAN: ${m}`);

function connectionUrl() {
    const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || '';
    if (!raw) return null;
    try {
        const u = new URL(raw);
        for (const k of ['sslmode', 'pgbouncer', 'supa', 'connection_limit', 'pool_timeout']) u.searchParams.delete(k);   // ssl diatur manual di bawah
        return { url: u.toString(), local: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) };
    } catch { return null; }
}

async function main() {
    if (process.env.SKIP_DB_MIGRATE === '1') { log('dilewati (SKIP_DB_MIGRATE=1).'); return 0; }
    const conn = connectionUrl();
    if (!conn) {
        warn('DATABASE_URL belum diisi, migrasi otomatis dilewati. Isi DATABASE_URL di Vercel (lihat CARA-PASANG.txt) atau jalankan supabase/migrations/2026-11-open-reseller.sql manual sekali.');
        return 0;
    }
    let pg;
    try { pg = require('pg'); } catch { warn('paket "pg" belum terpasang (npm install), migrasi dilewati.'); return 0; }

    const client = new pg.Client({ connectionString: conn.url, ssl: conn.local ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 20000, statement_timeout: 120000 });
    try { await client.connect(); }
    catch (e) { warn(`tidak bisa terhubung ke database (${e.message}). Migrasi dilewati. Kalau memakai koneksi "Direct" dan gagal (IPv6), pakai URL "Session pooler".`); return 0; }

    try {
        await client.query(`create table if not exists app_migrations (name text primary key, applied_at timestamptz not null default now())`);
        await client.query(`alter table app_migrations enable row level security`);
        await client.query(`revoke all on table app_migrations from anon, authenticated`).catch(() => {});

        for (const file of MIGRATIONS) {
            const done = await client.query('select 1 from app_migrations where name = $1', [file]);
            if (done.rowCount) { log(`${file}: sudah diterapkan, lewati.`); continue; }
            const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', file), 'utf8');
            log(`${file}: menerapkan...`);
            await client.query('begin');
            try {
                await client.query('select pg_advisory_xact_lock(7331001)');                       // dua build bersamaan tidak saling tabrak
                const again = await client.query('select 1 from app_migrations where name = $1', [file]);
                if (!again.rowCount) {
                    await client.query(sql);
                    await client.query('insert into app_migrations (name) values ($1) on conflict do nothing', [file]);
                }
                await client.query('commit');
            } catch (e) { await client.query('rollback').catch(() => {}); throw e; }
            log(`${file}: selesai.`);
        }
        await client.query(`notify pgrst, 'reload schema'`).catch(() => {});
        return 0;
    } catch (e) {
        console.error(`${tag} GAGAL: ${e.message}`);
        if (/relation "(users|orders|products|product_items|wallet_ledger)" does not exist/.test(e.message)) console.error(`${tag} Tabel dasar belum ada. Jalankan supabase/schema.sql sekali dulu.`);
        console.error(`${tag} Build dihentikan supaya tidak ada versi yang tidak cocok dengan database. Versi lama tetap live.`);
        return 1;
    } finally { await client.end().catch(() => {}); }
}

main().then((c) => process.exit(c), (e) => { console.error(tag, e); process.exit(1); });
