const { supabase, requireAuth } = require('./_lib');

// Each individual chunk request must stay well under the platform's hard
// request-body ceiling (~4.5MB on Vercel). The client sends chunks well
// below this; this is a defensive backstop against a misbehaving client.
const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
const UPLOAD_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { uploadId, chunkIndex, chunk } = req.body || {};
    if (!uploadId || !UPLOAD_ID_RE.test(uploadId)) return res.status(400).json({ error: 'Invalid upload id.' });
    if (typeof chunkIndex !== 'number' || chunkIndex < 0 || !Number.isInteger(chunkIndex)) {
      return res.status(400).json({ error: 'Invalid chunk index.' });
    }
    if (!chunk) return res.status(400).json({ error: 'No chunk data received.' });

    const buffer = Buffer.from(chunk, 'base64');
    if (buffer.length > MAX_CHUNK_BYTES) {
      return res.status(400).json({ error: `Chunk is larger than the ${(MAX_CHUNK_BYTES / 1024 / 1024).toFixed(1)}MB per-request limit.` });
    }

    const db = supabase();
    const bucket = process.env.SUPABASE_BUCKET || 'employee-files';
    const path = `imports/${uploadId}/${String(chunkIndex).padStart(6, '0')}`;
    const upload = await db.storage.from(bucket).upload(path, buffer, { contentType: 'application/octet-stream', upsert: true });
    if (upload.error) throw upload.error;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Chunk upload failed' });
  }
};
