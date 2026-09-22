const ExcelJS = require('exceljs');
const { supabase, requireAuth, safeName } = require('./_lib');
const { EXPORT_COLUMNS, DATE_KEYS, normHeader } = require('./_columns');

// Vercel Node serverless functions have a hard ~4.5MB request body limit that
// cannot be raised from application code. Base64 adds ~33% overhead, so we
// reject comfortably before that platform ceiling with a clear, actionable
// error rather than letting the platform fail the request with an opaque one.
const MAX_UPLOAD_BYTES = 3.2 * 1024 * 1024;

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

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { data } = req.body || {};
    if (!data) return res.status(400).json({ error: 'No file data received.' });
    const match = String(data).match(/^data:[^;]+;base64,(.+)$/);
    const base64 = match ? match[1] : data;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(400).json({
        error: `File is ${(buffer.length / 1024 / 1024).toFixed(1)}MB, which exceeds the ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1)}MB import limit imposed by the hosting platform. Please split the workbook into smaller batches (e.g. by site or by a few hundred rows) and import each batch separately.`
      });
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'The workbook has no worksheets.' });

    // Locate the header row by looking for the Employee ID column header,
    // scanning a generous number of rows in case of extra title rows above it.
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
      return res.status(400).json({ error: 'Could not find the header row (expected an "EMP.ID No." column). Please use a file exported from this system, or matching its column layout.' });
    }

    // Map each known field to its 1-based column number by matching header text.
    const colIndex = {};
    const headerRow = ws.getRow(headerRowNumber);
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const norm = normHeader(cellText(cell));
      const col = EXPORT_COLUMNS.find(c => normHeader(c.header) === norm);
      if (col) colIndex[col.key] = colNumber;
    });
    if (!colIndex.employee_id) return res.status(400).json({ error: 'Could not locate the Employee ID column.' });

    // The row directly under headers holds field serial numbers (1, 2, 3...)
    // in this system's own layout; real data starts the row after that.
    const dataStartRow = headerRowNumber + 2;
    const rowsByNumber = {}; // excel row number -> parsed employee record
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

    const employeeIds = Object.values(rowsByNumber).map(r => r.employee_id);
    if (!employeeIds.length) {
      return res.status(400).json({ error: 'No employee rows with an Employee ID were found below the header.' });
    }

    // Extract embedded images and associate each with the employee row/column
    // it was anchored to, so a Photo image never lands on the wrong employee
    // or in the Signature slot.
    const pendingImages = []; // { employeeId, category, buffer, extension }
    const images = ws.getImages();
    for (const img of images) {
      const media = wb.model.media[img.imageId];
      if (!media || !media.buffer) continue;
      const anchorRow = img.range?.tl?.nativeRow;
      const anchorCol = img.range?.tl?.nativeCol;
      if (anchorRow === undefined || anchorCol === undefined) continue;
      const excelRow = Math.round(anchorRow) + 1; // stored anchors are 0-based
      const excelCol = Math.round(anchorCol) + 1;
      const record = rowsByNumber[excelRow];
      if (!record) continue; // image isn't anchored to a recognized data row
      let category = null;
      if (colIndex.photo && excelCol === colIndex.photo) category = 'photo';
      else if (colIndex.signature && excelCol === colIndex.signature) category = 'signature';
      if (!category) continue; // image in some other column -- not our concern
      pendingImages.push({ employeeId: record.employee_id, category, buffer: media.buffer, extension: media.extension || 'png' });
    }

    const db = supabase();
    const bucket = process.env.SUPABASE_BUCKET || 'employee-files';

    // Upsert employee data rows first (by Employee ID), so re-importing an
    // exported file updates existing employees instead of being skipped --
    // this is what makes the export -> import round trip actually verify
    // that data was preserved, per the round-trip requirement.
    const rows = Object.values(rowsByNumber);
    const { data: upserted, error: upsertError } = await db
      .from('employees')
      .upsert(rows, { onConflict: 'employee_id' })
      .select('id, employee_id, photo_path, signature_path');
    if (upsertError) throw upsertError;
    const byEmployeeId = {};
    upserted.forEach(e => { byEmployeeId[e.employee_id] = e; });

    // Now upload extracted images and point each employee's photo/signature
    // at the newly uploaded file, replacing (not stacking) any previous file
    // for that same slot -- mirrors api/upload.js's replace behavior.
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

    return res.status(200).json({
      employeesImported: rows.length,
      photosImported,
      signaturesImported,
      imageFailures
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Import failed' });
  }
};
