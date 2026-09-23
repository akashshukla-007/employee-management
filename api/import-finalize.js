const { supabase, requireAuth } = require('./_lib');
const { processWorkbookBuffer } = require('./_importCore');

const UPLOAD_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const db = supabase();
  const bucket = process.env.SUPABASE_BUCKET || 'employee-files';
  let chunkPaths = [];
  try {
    const { uploadId, totalChunks } = req.body || {};
    if (!uploadId || !UPLOAD_ID_RE.test(uploadId)) return res.status(400).json({ error: 'Invalid upload id.' });
    if (!Number.isInteger(totalChunks) || totalChunks < 1) return res.status(400).json({ error: 'Invalid chunk count.' });

    chunkPaths = Array.from({ length: totalChunks }, (_, i) => `imports/${uploadId}/${String(i).padStart(6, '0')}`);

    // Download every chunk (server-to-server: this is our function fetching
    // FROM Supabase, not a browser POSTing TO us, so the platform's incoming
    // request-body limit never applies to this step regardless of file size).
    const buffers = [];
    for (const path of chunkPaths) {
      const { data, error } = await db.storage.from(bucket).download(path);
      if (error) throw new Error(`Missing or unreadable chunk (${path}): ${error.message}`);
      buffers.push(Buffer.from(await data.arrayBuffer()));
    }
    const fullBuffer = Buffer.concat(buffers);

    const result = await processWorkbookBuffer(fullBuffer);
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Import failed' });
  } finally {
    // Best-effort cleanup of the temp chunks regardless of success/failure.
    if (chunkPaths.length) {
      try { await db.storage.from(bucket).remove(chunkPaths); } catch (_) { /* non-fatal */ }
    }
  }
};
