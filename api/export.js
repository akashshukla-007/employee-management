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
  { key: 'present_address', header: 'PRESENT ADRESS' },
  { key: 'permanent_address', header: 'PERMANENT ADDRESS' },
  { key: 'service_book_no', header: 'SERVICE BOOK No.' },
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
    ws.getCell('E2').value = 'FORM - A (ALL SITE)';
    ws.mergeCells('E2:AJ2');
    ws.getCell('E3').value = 'EMPLOYEE REGISTER';
    ws.mergeCells('E3:AJ3');
    ws.getCell('E4').value = '[SHEDULE (SEE RULES No-2(1))] , PART-A [FOR ALL ESHTABLISHMENT]';
    ws.mergeCells('E4:AJ4');
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
      const values = {
        site_code: e.site_code, pending_remark: e.pending_remark, sr_no: e.sr_no || index + 1,
        employee_id: e.employee_id, employee_name: e.employee_name, surname: e.surname, gender: e.gender,
        father_spouse_name: e.father_spouse_name, date_of_birth: e.date_of_birth ? new Date(e.date_of_birth) : null,
        nationality: e.nationality, education_level: e.education_level,
        date_of_joining: e.date_of_joining ? new Date(e.date_of_joining) : null, designation: e.designation,
        category: e.category, type_of_employment: e.type_of_employment, mobile_no: e.mobile_no,
        uan: e.uan, pan: e.pan, esic_ip: e.esic_ip, lwf: e.lwf, aadhaar: e.aadhaar,
        bank_account_no: e.bank_account_no, bank_name: e.bank_name, ifsc_branch: e.ifsc_branch,
        present_address: e.present_address, permanent_address: e.permanent_address,
        service_book_no: e.service_book_no, date_of_exit: e.date_of_exit ? new Date(e.date_of_exit) : null,
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
    ws.autoFilter = { from: 'C8', to: 'AJ8' };
    for (let c = 1; c <= 36; c++) {
      const header = ws.getCell(8, c).value;
      ws.getColumn(c).width = c <= 2 ? 4 : (c === 33 ? 14 : (c === 34 ? 20 : Math.min(38, Math.max(12, String(header || '').replace(/\n/g, ' ').length + 3))));
    }
    ws.getColumn(27).width = 38;
    ws.getColumn(28).width = 38;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-database-export.xlsx"');
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Export failed' });
  }
};
