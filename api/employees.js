const { supabase, requireAuth, age } = require('./_lib');

const editableFields = [
  'site_code','pending_remark','employee_id','employee_name','surname','gender','blood_group',
  'father_spouse_name','date_of_birth','nationality','education_level','date_of_joining',
  'designation','category','type_of_employment','mobile_no','uan','pan','esic_ip','lwf',
  'aadhaar','bank_account_no','bank_name','ifsc_branch',
  'present_address_line','present_city','present_state','present_pincode',
  'permanent_address_line','permanent_city','permanent_state','permanent_pincode',
  'date_of_exit','reason_exit','mark_for_identification','remark'
];

// Employees created before the address-split migration only have the legacy
// single-field present_address / permanent_address text. Fall back to that
// text (as the "line" field) so old records keep displaying their address
// instead of appearing blank, without touching the stored legacy columns.
function withLegacyAddressFallback(row) {
  const copy = { ...row };
  if (!copy.present_address_line && copy.present_address) copy.present_address_line = copy.present_address;
  if (!copy.permanent_address_line && copy.permanent_address) copy.permanent_address_line = copy.permanent_address;
  return copy;
}

async function withSignedImages(db, rows) {
  const bucket = process.env.SUPABASE_BUCKET || 'employee-files';
  return Promise.all((rows || []).map(async rawRow => {
    const copy = withLegacyAddressFallback(rawRow);
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
  if (row.aadhaar) row.aadhaar = String(row.aadhaar).replace(/\D/g, '');
  if (row.aadhaar === '') row.aadhaar = null;
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
      if (row.aadhaar) {
        const { data: dup } = await db.from('employees').select('id,employee_name,employee_id').eq('aadhaar', row.aadhaar).limit(1);
        if (dup?.length) return res.status(409).json({ error: `Aadhaar number already exists for employee ${dup[0].employee_id || dup[0].employee_name || ''}.` });
      }
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
      if (row.aadhaar) {
        const { data: dup } = await db.from('employees').select('id,employee_name,employee_id').eq('aadhaar', row.aadhaar).neq('id', id).limit(1);
        if (dup?.length) return res.status(409).json({ error: `Aadhaar number already exists for employee ${dup[0].employee_id || dup[0].employee_name || ''}.` });
      }
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
