const ExcelJS = require('exceljs');
const { imageSize } = require('image-size');
const path = require('path');
const { requireAuth, age } = require('./_lib');
const { query } = require('./_db');
const storage = require('./_storage');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'employee-export-template.xlsx');
const PHOTO_COL = 30;      // AD in the supplied template
const SIGNATURE_COL = 31;  // AE in the supplied template
const IMAGE_ROW_POINTS = 48;
const IMAGE_PADDING_PX = 6;

function charsToPx(chars) { return Math.round(chars * 7 + 5); }
function pointsToPx(points) { return Math.round(points * 96 / 72); }

function extensionFromPath(p) {
  const m = String(p || '').match(/\.([a-zA-Z0-9]+)$/);
  const ext = (m ? m[1] : 'jpg').toLowerCase();
  return ext === 'jpg' ? 'jpeg' : ext;
}

async function addFittedImage(wb, ws, storagePath, col, row, boxWpx, boxHpx) {
  if (!storagePath) return;
  try {
    const buffer = await storage.download(storagePath);
    const extension = extensionFromPath(storagePath);
    let srcW, srcH;
    try {
      const dims = imageSize(buffer);
      srcW = dims.width;
      srcH = dims.height;
    } catch (_) {
      srcW = boxWpx;
      srcH = boxHpx;
    }
    const maxW = Math.max(1, boxWpx - IMAGE_PADDING_PX);
    const maxH = Math.max(1, boxHpx - IMAGE_PADDING_PX);
    const scale = Math.min(maxW / srcW, maxH / srcH);
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
  } catch (_) {
    // Missing/unreadable image files should not prevent the Excel export.
  }
}

function copyRowStyle(ws, sourceRowNumber, targetRowNumber, lastColumn) {
  const source = ws.getRow(sourceRowNumber);
  const target = ws.getRow(targetRowNumber);
  target.height = source.height || IMAGE_ROW_POINTS;
  for (let c = 1; c <= lastColumn; c++) {
    const from = source.getCell(c);
    const to = target.getCell(c);
    if (from.hasStyle) to.style = { ...from.style };
    if (from.numFmt) to.numFmt = from.numFmt;
  }
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const result = await query('select * from employees order by sr_no asc');
    const data = result.rows;

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(TEMPLATE_PATH);
    const ws = wb.getWorksheet('ORIG-EMPLOYEE DATA BASE') || wb.worksheets[0];
    if (!ws) throw new Error('The employee export template has no worksheet.');

    // Remove template/example images so only real employee images are exported.
    for (const image of ws.getImages()) ws.removeImage(image.imageId);

    const firstDataRow = 10;
    const lastTemplateRow = Math.max(ws.rowCount, firstDataRow);
    const lastColumn = 32; // A:AF in the supplied company template

    // Keep template formatting, but never export the example employee records
    // that are present in the provided workbook.
    for (let r = firstDataRow; r <= lastTemplateRow; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= lastColumn; c++) row.getCell(c).value = null;
    }

    // The template's fixed serial row is kept as 1..32 for consistent output.
    for (let c = 1; c <= lastColumn; c++) {
      const cell = ws.getCell(9, c);
      if (c === 1) cell.value = 1;
      else cell.value = c - 1;
    }

    for (let index = 0; index < data.length; index++) {
      const e = data[index];
      const rowNumber = firstDataRow + index;
      if (rowNumber > lastTemplateRow) copyRowStyle(ws, firstDataRow, rowNumber, lastColumn);
      const row = ws.getRow(rowNumber);
      const presentAddress = [
        e.present_address_line || e.present_address,
        e.present_city,
        e.present_state,
        e.present_pincode
      ].filter(v => v !== null && v !== undefined && String(v).trim() !== '').join(', ');
      const permanentAddress = [
        e.permanent_address_line || e.permanent_address,
        e.permanent_city,
        e.permanent_state,
        e.permanent_pincode
      ].filter(v => v !== null && v !== undefined && String(v).trim() !== '').join(', ');

      // Column mapping follows the uploaded company template exactly (A:AF).
      // Fields absent from the database are intentionally left blank.
      const values = [
        e.site_code ?? '',                                      // A SITE CODE
        e.sr_no ?? index + 1,                                   // B SR No-
        e.employee_id ?? '',                                    // C EMP.ID No.
        [e.employee_name, e.surname].filter(Boolean).join(' ') || '', // D EMPLOYEE NAME
        e.surname ?? '',                                        // E SURNAME
        e.gender ?? '',                                         // F GENDER
        e.father_spouse_name ?? '',                             // G FATHER/SPOUSE NAME
        e.date_of_birth ? new Date(e.date_of_birth) : '',       // H DATE OF BIRTH
        e.nationality ?? '',                                    // I NATIONALITY
        e.education_level ?? '',                                // J EDUCATION LEVEL
        e.date_of_joining ? new Date(e.date_of_joining) : '',   // K DATE OF JOINING
        e.designation ?? '',                                    // L DESIGNATION
        e.category ?? '',                                       // M CATEGORY
        e.type_of_employment ?? '',                             // N TYPE OF EMPLOYMENT
        e.mobile_no ?? '',                                      // O MOBILE No.
        e.uan ?? '',                                            // P UAN
        e.pan ?? '',                                            // Q PAN
        e.esic_ip ?? '',                                        // R ESIC IP
        e.lwf ?? '',                                            // S LWF
        e.aadhaar ?? '',                                        // T ADHAR
        e.bank_account_no ?? '',                                // U BANK A/C No.
        e.bank_name ?? '',                                      // V BANK NAME
        e.ifsc_branch ?? '',                                    // W IFSC (BRANCH)
        presentAddress,                                         // X PRESENT ADDRESS
        permanentAddress,                                       // Y PERMANENT ADDRESS
        e.service_book_no ?? '',                                // Z SERVICE BOOK No.
        e.date_of_exit ? new Date(e.date_of_exit) : '',         // AA DATE OF EXIT
        e.reason_exit ?? '',                                    // AB REASON FOR EXIT
        e.mark_for_identification ?? '',                         // AC MARK FOR IDENTIFICATION
        '',                                                     // AD PHOTO (image anchored below)
        '',                                                     // AE SPECIMAN SIGNATURE (image anchored below)
        e.remark ?? ''                                          // AF REMARK
      ];

      values.forEach((value, i) => {
        const cell = row.getCell(i + 1);
        cell.value = value;
        cell.alignment = { ...(cell.alignment || {}), vertical: 'top', wrapText: true };
        if ([8, 11, 27].includes(i + 1) && value) cell.numFmt = 'dd-mm-yyyy';
      });

      row.height = IMAGE_ROW_POINTS;
      await addFittedImage(wb, ws, e.photo_path, PHOTO_COL, rowNumber, charsToPx(ws.getColumn(PHOTO_COL).width || 12), pointsToPx(IMAGE_ROW_POINTS));
      await addFittedImage(wb, ws, e.signature_path, SIGNATURE_COL, rowNumber, charsToPx(ws.getColumn(SIGNATURE_COL).width || 16), pointsToPx(IMAGE_ROW_POINTS));
    }

    // Keep template's row headings, merged establishment details, column widths,
    // borders and page layout as provided by the company workbook.
    ws.views = [{ state: 'frozen', ySplit: 9, xSplit: 0, topLeftCell: 'A10' }];
    ws.autoFilter = { from: 'A8', to: 'AF8' };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-register-company-format.xlsx"');
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Export failed' });
  }
};
