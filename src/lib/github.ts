/**
 * Sinkron katalog ke repository GitHub (opsional, diatur lewat env GITHUB_*).
 */

const DEFAULT_GH_CONFIG = {
    // Semua dari environment variable Vercel. Tidak ada token/repo yang ditulis di kode.
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repos: (process.env.GITHUB_REPOS || '').split(',').map((r) => r.trim()).filter(Boolean),
    branch: process.env.GITHUB_BRANCH || 'main',
    filePath: 'data/store-data.json',
};

export async function syncStoreToGitHub(commitMessage?: string, customData?: any) {
    const { token, owner, repos, branch, filePath } = DEFAULT_GH_CONFIG;
    if (!token || !owner || !repos.length) {
        return { success: false, error: 'GitHub sync belum dikonfigurasi (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPOS)' };
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'nextjs-vip-store',
        'Content-Type': 'application/json',
    };

    let lastCommitSha: string | null = null;
    let lastCommitUrl: string | null = null;
    const errors: string[] = [];

    for (const repo of repos) {
        const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
        try {
            // 1. Ambil SHA file saat ini (jika sudah ada)
            let sha: string | null = null;
            try {
                const getRes = await fetch(`${baseUrl}?ref=${encodeURIComponent(branch)}&_t=${Date.now()}`, {
                    headers,
                    cache: 'no-store',
                });
                if (getRes.ok) {
                    const fileInfo = await getRes.json();
                    sha = fileInfo.sha || null;
                }
            } catch (e) {
                // Ignore if file doesn't exist yet
            }

            // 2. Siapkan konten JSON
            const contentStr = JSON.stringify(
                customData || {
                    updated_at: new Date().toISOString(),
                    synced_by: 'Admin Dashboard',
                },
                null,
                2
            );
            const base64Content = Buffer.from(contentStr, 'utf-8').toString('base64');

            const nowStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
            const body: any = {
                message: commitMessage || `Auto-sync data via Admin Dashboard (${nowStr})`,
                content: base64Content,
                branch: branch,
            };
            if (sha) body.sha = sha;

            // 3. PUT ke GitHub API
            const putRes = await fetch(baseUrl, {
                method: 'PUT',
                headers,
                body: JSON.stringify(body),
            });

            const putJson = await putRes.json().catch(() => ({}));
            if (!putRes.ok) {
                errors.push(`${repo}: ${putJson.message || putRes.status}`);
            } else {
                lastCommitSha = putJson.commit?.sha || null;
                lastCommitUrl = putJson.commit?.html_url || null;
            }
        } catch (e: any) {
            errors.push(`${repo}: ${e.message || 'Gagal konek'}`);
        }
    }

    if (errors.length === repos.length) {
        return {
            success: false,
            error: errors.join(', '),
        };
    }

    return {
        success: true,
        commitSha: lastCommitSha,
        commitUrl: lastCommitUrl,
        delayNotice: 'Tampilan website di Vercel akan terupdate otomatis ~1 menit ke depan karena proses build & delay di GitHub.',
    };
}
