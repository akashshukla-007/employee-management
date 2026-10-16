const ExcelJS = require('exceljs');
const { imageSize } = require('image-size');
const { supabase, requireAuth, age } = require('./_lib');
const { EXPORT_COLUMNS: columns } = require('./_columns');

// Fixed, deliberate box sizes for the Photo and Signature columns (in Excel's
// own units) -- used both to size the column/row AND to compute how each
// image should be scaled to fit inside that exact box. Keeping one source of
// truth for these numbers is what keeps the column width, row height, and
// image placement all in agreement with each other.
const PHOTO_COL_CHARS = 12;
const SIGNATURE_COL_CHARS = 16;
const IMAGE_ROW_POINTS = 60;
const IMAGE_PADDING_PX = 6; // small margin so the image never touches the cell border

// Excel column widths are in "characters" of the default font; convert to an
// approximate pixel width using the standard Calibri-11 formula. Row heights
// are in points; 1pt = 96/72 px. These only need to be close enough for
// visually correct centering, not pixel-perfect.
function charsToPx(chars) { return Math.round(chars * 7 + 5); }
function pointsToPx(points) { return Math.round(points * 96 / 72); }

async function signedUrl(db, bucket, path) {
  if (!path) return null;
  const r = await db.storage.from(bucket).createSignedUrl(path, 300);
  return r.data?.signedUrl || null;
}

// Downloads the image, reads its real width/height, scales it down or up
// (preserving aspect ratio -- never stretching) so it fits snugly inside the
// given cell's pixel box, then anchors it centered within that exact cell.
async function addFittedImage(wb, ws, url, col, row, boxWpx, boxHpx) {
  if (!url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'jpeg';

    let srcW, srcH;
    try {
      const dims = imageSize(buffer);
      srcW = dims.width; srcH = dims.height;
    } catch (_) {
      srcW = boxWpx; srcH = boxHpx; // unreadable dimensions: fall back to filling the box as a square-ish guess
    }

    const maxW = Math.max(1, boxWpx - IMAGE_PADDING_PX);
    const maxH = Math.max(1, boxHpx - IMAGE_PADDING_PX);
    const scale = Math.min(maxW / srcW, maxH / srcH); // "contain" fit: never distorts, never overflows the cell
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const offXpx = Math.max(0, (boxWpx - w) / 2);
    const offYpx = Math.max(0, (boxHpx - h) / 2);

    const imageId = wb.addImage({ buffer, extension });
    ws.addImage(imageId, {
      tl: { col: (col - 1) + offXpx / boxWpx, row: (row - 1) + offYpx / boxHpx },
      ext: { width: w, height: h },
      editAs: 'oneCell'
    });
  } catch (_) { /* image failure should not prevent the spreadsheet from being generated */ }
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const db = supabase();
    const { data, error } = await db.from('employees').select('*').order('sr_no', { ascending: true });
    if (error) throw error;

    const bucket = process.env.SUPABASE_BUCKET || 'employee-files';
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Employee Management System';
    wb.created = new Date();
    const ws = wb.addWorksheet('ORIG-EMPLOYEE DATA BASE');

    // Recreate the important layout from the master workbook.
    const lastLayoutCol = ws.getColumn(columns.length + 2).letter;
    ws.getCell('E2').value = 'FORM - A (ALL SITE)';
    ws.mergeCells(`E2:${lastLayoutCol}2`);
    ws.getCell('E3').value = 'EMPLOYEE REGISTER';
    ws.mergeCells(`E3:${lastLayoutCol}3`);
    ws.getCell('E4').value = '[SHEDULE (SEE RULES No-2(1))] , PART-A [FOR ALL ESHTABLISHMENT]';
    ws.mergeCells(`E4:${lastLayoutCol}4`);
    ws.getCell('E5').value = 'NAME OF ESTABLISHMENT :-';
    ws.getCell('H5').value = 'M/S NARMADA ENGINEERING';
    ws.getCell('P5').value = 'NAME OF OWNER';
    ws.getCell('S5').value = ':-JAGANNATH D SINGH';
    ws.getCell('E6').value = 'ADRESS OF ESTABLISHMENTS';
    ws.getCell('H6').value = 'E-7,4TH FLR,SIGNATURE GALLARIA,NR-,ANKLESHWAR,BHARUCH-393001(GUJ)';
    ws.getCell('E8').value = 'f';

    // Exact employee columns occupy C:AJ in the supplied master file.
    columns.forEach((c, i) => {
      const cell = ws.getCell(8, i + 3);
      cell.value = c.header;
      cell.font = { bold: true, size: 10 };
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    ws.getRow(8).height = 42;

    // Row 9 contains the field serial numbers in the source workbook.
    columns.forEach((_, i) => {
      const cell = ws.getCell(9, i + 3);
      cell.value = i + 1;
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    for (let index = 0; index < (data || []).length; index++) {
      const e = data[index];
      const rowNumber = 10 + index;
      const row = ws.getRow(rowNumber);
      // Employees created before the address-split migration only have the
      // legacy single-field present_address / permanent_address text. Fall
      // back to that text for the "line" column so old records still export
      // an address instead of a blank cell.
      const presentLine = e.present_address_line || e.present_address;
      const permanentLine = e.permanent_address_line || e.permanent_address;
      const values = {
        site_code: e.site_code, pending_remark: e.pending_remark, sr_no: e.sr_no || index + 1,
        employee_id: e.employee_id, employee_name: e.employee_name, surname: e.surname, gender: e.gender,
        blood_group: e.blood_group,
        father_spouse_name: e.father_spouse_name, date_of_birth: e.date_of_birth ? new Date(e.date_of_birth) : null,
        nationality: e.nationality, education_level: e.education_level,
        date_of_joining: e.date_of_joining ? new Date(e.date_of_joining) : null, designation: e.designation,
        category: e.category, type_of_employment: e.type_of_employment, mobile_no: e.mobile_no,
        uan: e.uan, pan: e.pan, esic_ip: e.esic_ip, lwf: e.lwf, aadhaar: e.aadhaar,
        bank_account_no: e.bank_account_no, bank_name: e.bank_name, ifsc_branch: e.ifsc_branch,
        present_address_line: presentLine, present_city: e.present_city, present_state: e.present_state, present_pincode: e.present_pincode,
        permanent_address_line: permanentLine, permanent_city: e.permanent_city, permanent_state: e.permanent_state, permanent_pincode: e.permanent_pincode,
        date_of_exit: e.date_of_exit ? new Date(e.date_of_exit) : null,
        reason_exit: e.reason_exit, mark_for_identification: e.mark_for_identification,
        remark: e.remark, age: age(e.date_of_birth)
      };

      columns.forEach((c, i) => {
        if (c.key === 'photo' || c.key === 'signature') return;
        const cell = row.getCell(i + 3);
        cell.value = values[c.key] ?? '';
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (['date_of_birth', 'date_of_joining', 'date_of_exit'].includes(c.key) && cell.value) cell.numFmt = 'dd-mm-yyyy';
      });

      const photoCol = columns.findIndex(c => c.key === 'photo') + 3;
      const sigCol = columns.findIndex(c => c.key === 'signature') + 3;
      const [photoUrl, signatureUrl] = await Promise.all([
        signedUrl(db, bucket, e.photo_path), signedUrl(db, bucket, e.signature_path)
      ]);
      const rowBoxHpx = pointsToPx(IMAGE_ROW_POINTS);
      await addFittedImage(wb, ws, photoUrl, photoCol, rowNumber, charsToPx(PHOTO_COL_CHARS), rowBoxHpx);
      await addFittedImage(wb, ws, signatureUrl, sigCol, rowNumber, charsToPx(SIGNATURE_COL_CHARS), rowBoxHpx);
      row.height = IMAGE_ROW_POINTS;
    }

    ws.freezePanes = 'C10';
    const lastColLetter = ws.getColumn(columns.length + 2).letter;
    ws.autoFilter = { from: 'C8', to: `${lastColLetter}8` };

    // Widths keyed by column identity (not fixed column numbers), so adding
    // or reordering columns above never silently misaligns these overrides.
    const wideTextKeys = ['present_address_line', 'permanent_address_line'];
    const narrowKeys = { photo: PHOTO_COL_CHARS, signature: SIGNATURE_COL_CHARS, remark: 20 };
    for (let c = 1; c <= columns.length + 2; c++) {
      const header = ws.getCell(8, c).value;
      const key = columns[c - 3]?.key; // columns start at sheet column 3 (C)
      if (c <= 2) { ws.getColumn(c).width = 4; continue; }
      if (key && narrowKeys[key] !== undefined) { ws.getColumn(c).width = narrowKeys[key]; continue; }
      if (key && wideTextKeys.includes(key)) { ws.getColumn(c).width = 38; continue; }
      ws.getColumn(c).width = Math.min(38, Math.max(12, String(header || '').replace(/\n/g, ' ').length + 3));
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-database-export.xlsx"');
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Export failed' });
  }
};
