const ExcelJS = require('exceljs');
const { supabase, requireAuth, age } = require('./_lib');

const columns = [
  { key: 'site_code', header: 'SITE CODE' },
  { key: 'pending_remark', header: 'PENDING\nREMARK' },
  { key: 'sr_no', header: 'SR No-' },
  { key: 'employee_id', header: 'EMP.ID No.' },
  { key: 'employee_name', header: 'EMPLOYEE NAME' },
  { key: 'surname', header: 'SURNAME' },
  { key: 'gender', header: 'GENDER' },
  { key: 'blood_group', header: 'BLOOD GROUP' },
  { key: 'father_spouse_name', header: 'FATHER/SPOUSE NAME' },
  { key: 'date_of_birth', header: 'DATE OF BIRTH' },
  { key: 'nationality', header: 'NATIONALITY' },
  { key: 'education_level', header: 'EDUCATION LEVEL' },
  { key: 'date_of_joining', header: 'DATE OF JOINING' },
  { key: 'designation', header: 'DISIGNATION' },
  { key: 'category', header: 'CATEGORY \nMS/S/SS/US' },
  { key: 'type_of_employment', header: 'TYPE OF EMPLOYMENT' },
  { key: 'mobile_no', header: 'MOBILE No.' },
  { key: 'uan', header: 'UAN' },
  { key: 'pan', header: 'PAN' },
  { key: 'esic_ip', header: 'ESIC IP' },
  { key: 'lwf', header: 'LWF' },
  { key: 'aadhaar', header: 'ADHAR' },
  { key: 'bank_account_no', header: 'BANK A/C No.' },
  { key: 'bank_name', header: 'BANK NAME' },
  { key: 'ifsc_branch', header: 'IFSC\n(BRANCH)' },
  { key: 'present_address_line', header: 'PRESENT ADDRESS' },
  { key: 'present_city', header: 'PRESENT CITY' },
  { key: 'present_state', header: 'PRESENT STATE' },
  { key: 'present_pincode', header: 'PRESENT PIN CODE' },
  { key: 'permanent_address_line', header: 'PERMANENT ADDRESS' },
  { key: 'permanent_city', header: 'PERMANENT CITY' },
  { key: 'permanent_state', header: 'PERMANENT STATE' },
  { key: 'permanent_pincode', header: 'PERMANENT PIN CODE' },
  { key: 'date_of_exit', header: 'DATE OF EXITE' },
  { key: 'reason_exit', header: 'REASON EXITE' },
  { key: 'mark_for_identification', header: 'MARK FOR IDENTIFICATION' },
  { key: 'photo', header: 'PHOTO' },
  { key: 'signature', header: 'SPECIMAN SIGNATURE' },
  { key: 'remark', header: 'REMARK' },
  { key: 'age', header: 'AGE ON CURRENT DATE' }
];

async function signedUrl(db, bucket, path) {
  if (!path) return null;
  const r = await db.storage.from(bucket).createSignedUrl(path, 300);
  return r.data?.signedUrl || null;
}

async function addImageFromUrl(wb, ws, url, col, row, width, height) {
  if (!url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    const extension = contentType.includes('png') ? 'png' : 'jpeg';
    const imageId = wb.addImage({ buffer, extension });
    ws.addImage(imageId, { tl: { col: col - 1, row: row - 1 }, ext: { width, height } });
  } catch (_) { /* image failure should not prevent the spreadsheet */ }
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
      await addImageFromUrl(wb, ws, photoUrl, photoCol, rowNumber, 60, 60);
      await addImageFromUrl(wb, ws, signatureUrl, sigCol, rowNumber, 100, 45);
      row.height = 62;
    }

    ws.freezePanes = 'C10';
    const lastColLetter = ws.getColumn(columns.length + 2).letter;
    ws.autoFilter = { from: 'C8', to: `${lastColLetter}8` };

    // Widths keyed by column identity (not fixed column numbers), so adding
    // or reordering columns above never silently misaligns these overrides.
    const wideTextKeys = ['present_address_line', 'permanent_address_line'];
    const narrowKeys = { signature: 14, remark: 20 };
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
