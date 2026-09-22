const { supabase, requireAuth, safeName } = require('./_lib');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { employeeId, type, data, mimeType } = req.body || {};
    if (!employeeId || !['photo', 'signature'].includes(type) || !data) {
      return res.status(400).json({ error: 'Employee ID, type and image are required.' });
    }
    const match = String(data).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid image data.' });
    const mime = mimeType || match[1];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      return res.status(400).json({ error: 'Only JPG, PNG and WebP images are allowed.' });
    }
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image must be 5 MB or smaller.' });

    const db = supabase();
    const bucket = process.env.SUPABASE_BUCKET || 'employee-files';
    const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
    const path = `${type}s/${safeName(employeeId)}-${Date.now()}.${ext}`;

    const { data: old, error: oldError } = await db.from('employees').select('photo_path,signature_path').eq('employee_id', employeeId).single();
    if (oldError) throw oldError;

    const upload = await db.storage.from(bucket).upload(path, buf, { contentType: mime, upsert: false });
    if (upload.error) throw upload.error;

    const update = type === 'photo' ? { photo_path: path } : { signature_path: path };
    const { error } = await db.from('employees').update(update).eq('employee_id', employeeId);
    if (error) {
      await db.storage.from(bucket).remove([path]);
      throw error;
    }

    const previous = type === 'photo' ? old.photo_path : old.signature_path;
    if (previous) await db.storage.from(bucket).remove([previous]);

    const signed = await db.storage.from(bucket).createSignedUrl(path, 60 * 60);
    return res.status(200).json({ path, url: signed.data?.signedUrl || null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Upload failed' });
  }
};
