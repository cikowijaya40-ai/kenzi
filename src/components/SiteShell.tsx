'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, fixImg, refreshMe, rp, useCatalog, useMe } from '@/lib/client';
import SaleToast from './SaleToast';

/** "KENZIxCheat" → ["KENZIx", "Cheat"]; "Toko Saya" → ["Toko", "Saya"] */
export function splitBrand(name: string): [string, string] {
    const n = (name || '').trim();
    if (/\s/.test(n)) { const [a, ...r] = n.split(/\s+/); return [a, r.join(' ')]; }
    const m = n.match(/^(.+?)(cheat)$/i);
    return m ? [m[1], m[2]] : [n, ''];
}

export function Brand({ name, logo, size = 38 }: { name: string; logo?: string; size?: number }) {
    const [a, b] = splitBrand(name);
    return (
        <>
            {logo && <img className="kx-logo" src={logo} alt="" width={size} height={size} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
            <span className="kx-name"><span className="a">{a}</span>{b && <span className="b">{b}</span>}</span>
        </>
    );
}

const NAV = [
    { href: '/', label: 'Beranda', icon: 'fa-house' },
    { href: '/produk', label: 'Produk', icon: 'fa-table-cells-large' },
    { href: '/dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
];

export default function SiteShell({ children, plain = false }: { children: React.ReactNode; plain?: boolean }) {
    const { user } = useMe();
    const { data } = useCatalog();
    const router = useRouter();
    const path = usePathname() || '/';
    const [open, setOpen] = useState(false);
    const S = data?.settings;
    const name = S?.site_name || 'KENZIxCheat';
    const logo = fixImg(S?.site_logo) || '/images/logo.svg';
    const wa = S?.whatsapp_cs ? `https://wa.me/${S.whatsapp_cs.replace(/\D/g, '')}` : '';
    const tg = S?.telegram_cs ? `https://t.me/${S.telegram_cs.replace('@', '')}` : '';
    const go = () => setOpen(false);
    const active = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));

    useEffect(() => { setOpen(false); }, [path]);
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    async function logout() {
        await api('/api/auth/logout', { method: 'POST' });
        refreshMe();
        setOpen(false);
        router.push('/');
        router.refresh();
    }

    return (
        <div className="kx">
            <header className="kx-header">
                <div className="kx-header-in">
                    <Link href="/" className="kx-brand" aria-label={name}><Brand name={name} logo={logo} /></Link>

                    <nav className="kx-nav" aria-label="Menu utama">
                        {NAV.map((n) => <Link key={n.href} href={n.href} className={active(n.href) ? 'active' : ''}>{n.label}</Link>)}
                    </nav>

                    <div className="kx-actions">
                        {user ? (
                            <Link href="/dashboard" className="kx-saldo" aria-label="Saldo">
                                <i className="fa-solid fa-wallet" /><span>{rp(user.balance)}</span>
                            </Link>
                        ) : (
                            <>
                                <Link href="/login" className="kx-btn-sm">Masuk</Link>
                                <Link href="/register" className="kx-btn-sm solid">Daftar</Link>
                            </>
                        )}
                        <button className="kx-icon-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
                            <i className={open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars'} />
                        </button>
                    </div>
                </div>
            </header>
            <div className="kx-spacer" />

            <div className={`kx-veil ${open ? 'on' : ''}`} onClick={go} />
            <aside className={`kx-panel ${open ? 'on' : ''}`} aria-label="Menu">
                <div className="kx-panel-head">
                    <span className="t"><Brand name={name} logo={logo} size={30} /></span>
                    <button className="kx-icon-btn" onClick={go} aria-label="Tutup"><i className="fa-solid fa-xmark" /></button>
                </div>

                {user ? (
                    <div className="kx-account">
                        <div className="av">{user.username.charAt(0).toUpperCase()}</div>
                        <div><b>{user.username}</b><small>Saldo {rp(user.balance)}</small></div>
                    </div>
                ) : (
                    <div className="kx-account guest">
                        <p>Masuk, isi saldo, lalu beli key otomatis dengan saldo akunmu.</p>
                        <div className="row"><Link href="/login" className="kx-btn-sm" onClick={go}>Masuk</Link><Link href="/register" className="kx-btn-sm solid" onClick={go}>Daftar</Link></div>
                    </div>
                )}

                <div className="kx-sec">Menu</div>
                <div className="kx-links">
                    {NAV.map((n) => (
                        <Link key={n.href} href={n.href} onClick={go} className={`kx-link ${active(n.href) ? 'active' : ''}`}>
                            <i className={`fa-solid ${n.icon} lead`} /><span>{n.label}</span><i className="fa-solid fa-chevron-right chev" />
                        </Link>
                    ))}
                    {user && <Link href="/dashboard#topup" onClick={go} className="kx-link"><i className="fa-solid fa-wallet lead" /><span>Isi Saldo</span><i className="fa-solid fa-chevron-right chev" /></Link>}
                </div>

                {(wa || tg) && (
                    <>
                        <div className="kx-sec">Hubungi Admin</div>
                        <div className="kx-links">
                            {wa && <a className="kx-link" href={wa} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-whatsapp lead" /><span>WhatsApp</span><i className="fa-solid fa-arrow-up-right-from-square chev" /></a>}
                            {tg && <a className="kx-link" href={tg} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-telegram lead" /><span>Telegram</span><i className="fa-solid fa-arrow-up-right-from-square chev" /></a>}
                        </div>
                    </>
                )}
                {user && <button className="kx-link danger" onClick={logout} style={{ margin: '14px 10px 0', width: 'calc(100% - 20px)' }}><i className="fa-solid fa-right-from-bracket lead" /><span>Keluar</span></button>}
            </aside>

            <main>{children}</main>

            {!plain && (
                <footer className="kx-footer">
                    <div className="kx-wrap">
                        <div className="cols">
                            <div>
                                <div className="f-brand"><Brand name={name} logo={logo} size={34} /></div>
                                <p className="about">{S?.footer_text || `${name} menyediakan key & akses premium otomatis. Isi saldo sekali, beli kapan saja.`}</p>
                                <div className="f-soc">
                                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><i className="fa-brands fa-whatsapp" /></a>}
                                    {tg && <a href={tg} target="_blank" rel="noopener noreferrer" aria-label="Telegram"><i className="fa-brands fa-telegram" /></a>}
                                </div>
                            </div>
                            <div>
                                <h4>Navigasi</h4>
                                <div className="links">
                                    {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
                                    <Link href="/register">Daftar Akun</Link>
                                </div>
                            </div>
                            <div>
                                <h4>Metode Isi Saldo</h4>
                                <div className="pay">
                                    {['QRIS', 'GoPay', 'OVO', 'DANA', 'ShopeePay'].map((n) => <span key={n}>{n}</span>)}
                                </div>
                            </div>
                        </div>
                        <div className="bottom">
                            <span>© {new Date().getFullYear()} {name}. All rights reserved.</span>
                            <span className="secure"><i className="fa-solid fa-shield-halved" /> Pembayaran Aman</span>
                        </div>
                    </div>
                </footer>
            )}
            {!plain && (path === '/' || path.startsWith('/produk')) && <SaleToast />}
            {!plain && wa && <a className="kx-fab" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chat admin"><i className="fa-brands fa-whatsapp" /><span>Chat Admin</span></a>}
        </div>
    );
}
