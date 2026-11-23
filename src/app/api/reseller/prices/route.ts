import { getResellerState } from '@/lib/reseller';
import { resellerPriceMap } from '@/lib/resellerPrice';
import { json, requireUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Peta harga reseller ("slug|sku" -> harga) untuk menimpa tampilan harga di toko bagi reseller yang login.
 * Hanya TAMPILAN. Harga yang dibayar selalu dihitung ulang di server saat beli.
 * Bukan reseller aktif -> prices: null (toko tetap tampil harga biasa).
 */
export async function GET(req: Request) {
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    const st = await getResellerState(auth.user);
    if (!st.ready || !st.isReseller || st.disabled) return json({ success: true, prices: null });
    try {
        return json({ success: true, prices: await resellerPriceMap() });
    } catch {
        return json({ success: true, prices: null });
    }
}
