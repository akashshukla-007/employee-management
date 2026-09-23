const ExcelJS = require('exceljs');
const { supabase, safeName } = require('./_lib');
const { EXPORT_COLUMNS, DATE_KEYS, normHeader } = require('./_columns');

const editableKeys = EXPORT_COLUMNS.map(c => c.key).filter(k => !['sr_no', 'photo', 'signature', 'age'].includes(k));

function excelValueToDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  return s ? s.slice(0, 10) : null;
}

function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.richText) return v.richText.map(t => t.text).join('');
  if (typeof v === 'object' && v.text) return v.text;
  if (v instanceof Date) return v;
  return v;
}

// Throws a plain Error with a user-facing message on any recognized problem;
// callers should catch and turn that into a 400/500 response as appropriate.
async function processWorkbookBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The workbook has no worksheets.');

  let headerRowNumber = -1;
  const maxScan = Math.min(ws.rowCount, 50);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    let found = false;
    row.eachCell({ includeEmpty: false }, cell => {
      if (normHeader(cellText(cell)) === normHeader('EMP.ID No.')) found = true;
    });
    if (found) { headerRowNumber = r; break; }
  }
  if (headerRowNumber < 0) {
    throw new Error('Could not find the header row (expected an "EMP.ID No." column). Please use a file exported from this system, or matching its column layout.');
  }

  const colIndex = {};
  const headerRow = ws.getRow(headerRowNumber);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const norm = normHeader(cellText(cell));
    const col = EXPORT_COLUMNS.find(c => normHeader(c.header) === norm);
    if (col) colIndex[col.key] = colNumber;
  });
  if (!colIndex.employee_id) throw new Error('Could not locate the Employee ID column.');

  const dataStartRow = headerRowNumber + 2;
  const rowsByNumber = {};
  for (let r = dataStartRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const idCell = colIndex.employee_id ? row.getCell(colIndex.employee_id) : null;
    const employeeId = String(cellText(idCell) ?? '').trim();
    if (!employeeId) continue;
    const record = { employee_id: employeeId };
    editableKeys.forEach(key => {
      if (key === 'employee_id') return;
      const col = colIndex[key];
      if (!col) return;
      let v = cellText(row.getCell(col));
      if (DATE_KEYS.includes(key)) v = excelValueToDate(v);
      else if (key === 'aadhaar') v = String(v ?? '').replace(/\D/g, '') || null;
      else v = v === '' || v === undefined ? null : String(v);
      record[key] = v;
    });
    rowsByNumber[r] = record;
  }

  const rows = Object.values(rowsByNumber);
  if (!rows.length) {
    throw new Error('No employee rows with an Employee ID were found below the header.');
  }

  const pendingImages = [];
  const images = ws.getImages();
  for (const img of images) {
    const media = wb.model.media[img.imageId];
    if (!media || !media.buffer) continue;
    const anchorRow = img.range?.tl?.nativeRow;
    const anchorCol = img.range?.tl?.nativeCol;
    if (anchorRow === undefined || anchorCol === undefined) continue;
    const excelRow = Math.round(anchorRow) + 1;
    const excelCol = Math.round(anchorCol) + 1;
    const record = rowsByNumber[excelRow];
    if (!record) continue;
    let category = null;
    if (colIndex.photo && excelCol === colIndex.photo) category = 'photo';
    else if (colIndex.signature && excelCol === colIndex.signature) category = 'signature';
    if (!category) continue;
    pendingImages.push({ employeeId: record.employee_id, category, buffer: media.buffer, extension: media.extension || 'png' });
  }

  const db = supabase();
  const bucket = process.env.SUPABASE_BUCKET || 'employee-files';

  const { data: upserted, error: upsertError } = await db
    .from('employees')
    .upsert(rows, { onConflict: 'employee_id' })
    .select('id, employee_id, photo_path, signature_path');
  if (upsertError) throw upsertError;
  const byEmployeeId = {};
  upserted.forEach(e => { byEmployeeId[e.employee_id] = e; });

  let photosImported = 0, signaturesImported = 0, imageFailures = 0;
  for (const img of pendingImages) {
    const emp = byEmployeeId[img.employeeId];
    if (!emp) continue;
    try {
      const path = `${img.category}s/${safeName(img.employeeId)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${img.extension}`;
      const contentType = img.extension === 'png' ? 'image/png' : img.extension === 'gif' ? 'image/gif' : 'image/jpeg';
      const upload = await db.storage.from(bucket).upload(path, img.buffer, { contentType, upsert: false });
      if (upload.error) throw upload.error;
      const updateField = img.category === 'photo' ? { photo_path: path } : { signature_path: path };
      const { error: updErr } = await db.from('employees').update(updateField).eq('employee_id', img.employeeId);
      if (updErr) { await db.storage.from(bucket).remove([path]); throw updErr; }
      const previous = img.category === 'photo' ? emp.photo_path : emp.signature_path;
      if (previous && previous !== path) await db.storage.from(bucket).remove([previous]);
      if (img.category === 'photo') { photosImported++; emp.photo_path = path; }
      else { signaturesImported++; emp.signature_path = path; }
    } catch (e) {
      console.error('Image import failed for', img.employeeId, img.category, e);
      imageFailures++;
    }
  }

  return { employeesImported: rows.length, photosImported, signaturesImported, imageFailures };
}

module.exports = { processWorkbookBuffer };
