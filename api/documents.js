const { supabase, requireAuth, safeName } = require('./_lib');

const CATEGORIES = ['joining_form', 'f11'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB per document file

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const db = supabase();
    const bucket = process.env.SUPABASE_BUCKET || 'employee-files';

    if (req.method === 'GET') {
      const { employeeId, category } = req.query;
      let query = db.from('employee_documents').select('*').order('uploaded_at', { ascending: true });
      if (employeeId) query = query.eq('employee_id', employeeId);
      if (category) query = query.eq('category', category);
      const { data, error } = await query;
      if (error) throw error;
      // Only sign URLs when a specific employee was requested (profile view).
      // A bulk, no-filter call (used for directory-wide document-count badges)
      // stays lightweight and skips the signed-URL round trip entirely.
      if (employeeId) {
        const withUrls = await Promise.all((data || []).map(async doc => {
          const signed = await db.storage.from(bucket).createSignedUrl(doc.file_path, 60 * 60);
          return { ...doc, url: signed.data?.signedUrl || null };
        }));
        return res.status(200).json({ data: withUrls });
      }
      return res.status(200).json({ data: (data || []).map(d => ({ id: d.id, employee_id: d.employee_id, category: d.category })) });
    }

    if (req.method === 'POST') {
      const { employeeId, category, data, fileName, mimeType } = req.body || {};
      if (!employeeId || !CATEGORIES.includes(category) || !data) {
        return res.status(400).json({ error: 'Employee ID, category and file are required.' });
      }
      const match = String(data).match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return res.status(400).json({ error: 'Invalid file data.' });
      const mime = mimeType || match[1];
      if (!ALLOWED_MIME.includes(mime)) return res.status(400).json({ error: 'Only JPG, PNG, WebP images or PDF files are allowed.' });
      const buf = Buffer.from(match[2], 'base64');
      if (buf.length > MAX_BYTES) return res.status(400).json({ error: 'File must be 10 MB or smaller.' });

      const { data: emp, error: empError } = await db.from('employees').select('employee_id').eq('employee_id', employeeId).single();
      if (empError || !emp) return res.status(404).json({ error: `Employee ${employeeId} was not found. Save the employee record before uploading documents.` });

      const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const path = `documents/${safeName(employeeId)}/${category}/${Date.now()}-${safeName(fileName || 'file')}.${ext}`;
      const upload = await db.storage.from(bucket).upload(path, buf, { contentType: mime, upsert: false });
      if (upload.error) throw upload.error;

      const { data: row, error } = await db.from('employee_documents').insert({
        employee_id: employeeId, category, file_path: path,
        file_name: fileName || null, mime_type: mime, file_size: buf.length
      }).select('*').single();
      if (error) { await db.storage.from(bucket).remove([path]); throw error; }

      const signed = await db.storage.from(bucket).createSignedUrl(path, 60 * 60);
      return res.status(201).json({ data: { ...row, url: signed.data?.signedUrl || null } });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Document id is required.' });
      const { data: doc, error: findError } = await db.from('employee_documents').select('file_path').eq('id', id).single();
      if (findError) throw findError;
      const { error } = await db.from('employee_documents').delete().eq('id', id);
      if (error) throw error;
      if (doc?.file_path) await db.storage.from(bucket).remove([doc.file_path]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
