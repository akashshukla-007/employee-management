const { supabase, requireAuth, age } = require('./_lib');

const editableFields = [
  'site_code','pending_remark','employee_id','employee_name','surname','gender',
  'father_spouse_name','date_of_birth','nationality','education_level','date_of_joining',
  'designation','category','type_of_employment','mobile_no','uan','pan','esic_ip','lwf',
  'aadhaar','bank_account_no','bank_name','ifsc_branch','present_address','permanent_address',
  'service_book_no','date_of_exit','reason_exit','mark_for_identification','remark'
];

async function withSignedImages(db, rows) {
  const bucket = process.env.SUPABASE_BUCKET || 'employee-files';
  return Promise.all((rows || []).map(async row => {
    const copy = { ...row };
    if (copy.photo_path) {
      const r = await db.storage.from(bucket).createSignedUrl(copy.photo_path, 60 * 60);
      copy.photo_url = r.data?.signedUrl || null;
    } else copy.photo_url = null;
    if (copy.signature_path) {
      const r = await db.storage.from(bucket).createSignedUrl(copy.signature_path, 60 * 60);
      copy.signature_url = r.data?.signedUrl || null;
    } else copy.signature_url = null;
    copy.age = age(copy.date_of_birth);
    return copy;
  }));
}

function cleanBody(body, includeSr = false) {
  const row = {};
  editableFields.forEach(f => {
    if (body[f] !== undefined) row[f] = body[f] === '' ? null : body[f];
  });
  if (includeSr && body.sr_no !== undefined && body.sr_no !== '') row.sr_no = Number(body.sr_no);
  return row;
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const db = supabase();
  try {
    if (req.method === 'GET') {
      const q = String(req.query.q || '').trim();
      let query = db.from('employees').select('*').order('sr_no', { ascending: true });
      if (q) {
        const safe = q.replace(/[%(),]/g, ' ');
        query = query.or(`employee_id.ilike.%${safe}%,employee_name.ilike.%${safe}%,site_code.ilike.%${safe}%,designation.ilike.%${safe}%,mobile_no.ilike.%${safe}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ data: await withSignedImages(db, data || []) });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const row = cleanBody(body, true);
      if (!row.employee_id) return res.status(400).json({ error: 'Employee ID is required.' });
      const { data, error } = await db.from('employees').insert(row).select('*').single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Employee ID already exists.' });
        throw error;
      }
      return res.status(201).json({ data: (await withSignedImages(db, [data]))[0] });
    }

    if (req.method === 'PUT') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Employee UUID is required.' });
      const row = cleanBody(req.body || false);
      if (row.employee_id === '') return res.status(400).json({ error: 'Employee ID is required.' });
      const { data, error } = await db.from('employees').update(row).eq('id', id).select('*').single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Employee ID already exists.' });
        throw error;
      }
      return res.status(200).json({ data: (await withSignedImages(db, [data]))[0] });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Employee UUID is required.' });
      const { data: emp, error: findError } = await db.from('employees').select('photo_path,signature_path').eq('id', id).single();
      if (findError) throw findError;
      const { error } = await db.from('employees').delete().eq('id', id);
      if (error) throw error;
      const bucket = process.env.SUPABASE_BUCKET || 'employee-files';
      const files = [emp.photo_path, emp.signature_path].filter(Boolean);
      if (files.length) await db.storage.from(bucket).remove(files);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
