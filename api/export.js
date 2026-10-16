const ExcelJS = require('exceljs');
const { imageSize } = require('image-size');
const path = require('path');
const { supabase, requireAuth } = require('./_lib');

const TEMPLATE_PATH = path.join(__dirname, 'employee-export-template.xlsx');
const BUCKET = process.env.SUPABASE_BUCKET || 'employee-files';

// The supplied company workbook uses columns C:AH and employee data starts at row 10.
const FIRST_DATA_ROW = 10;
const FIRST_DATA_COL = 3; // C
const LAST_DATA_COL = 34; // AH
const PHOTO_COL = 32; // AF
const SIGNATURE_COL = 33; // AG
const IMAGE_ROW_POINTS = 90;
const IMAGE_PADDING_PX = 6;

function charsToPx(chars) { return Math.round(chars * 7 + 5); }
function pointsToPx(points) { return Math.round(points * 96 / 72); }

function extensionFromContentType(contentType = '') {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpeg';
}

async function signedUrl(db, filePath) {
  if (!filePath) return null;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(filePath, 300);
  if (error) {
    console.error('Could not create signed URL for employee image:', error.message);
    return null;
  }
  return data?.signedUrl || null;
}

async function addFittedImage(workbook, worksheet, url, col, row, boxWidthPx, boxHeightPx) {
  if (!url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = extensionFromContentType(response.headers.get('content-type') || '');

    let sourceWidth = boxWidthPx;
    let sourceHeight = boxHeightPx;
    try {
      const dimensions = imageSize(buffer);
      sourceWidth = dimensions.width || boxWidthPx;
      sourceHeight = dimensions.height || boxHeightPx;
    } catch (_) {
      // Keep the fallback box dimensions if image metadata cannot be read.
    }

    const maxWidth = Math.max(1, boxWidthPx - IMAGE_PADDING_PX);
    const maxHeight = Math.max(1, boxHeightPx - IMAGE_PADDING_PX);
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const offsetX = Math.max(0, (boxWidthPx - width) / 2);
    const offsetY = Math.max(0, (boxHeightPx - height) / 2);

    const imageId = workbook.addImage({ buffer, extension });
    worksheet.addImage(imageId, {
      tl: {
        col: (col - 1) + offsetX / boxWidthPx,
        row: (row - 1) + offsetY / boxHeightPx
      },
      ext: { width, height },
      editAs: 'oneCell'
    });
  } catch (error) {
    // A missing photo/signature should not make the whole register fail.
    console.error('Skipping an employee photo/signature during export:', error.message);
  }
}

function copyRowStyle(worksheet, sourceRowNumber, targetRowNumber) {
  const source = worksheet.getRow(sourceRowNumber);
  const target = worksheet.getRow(targetRowNumber);
  target.height = source.height || IMAGE_ROW_POINTS;
  for (let col = 1; col <= LAST_DATA_COL; col++) {
    const sourceCell = source.getCell(col);
    const targetCell = target.getCell(col);
    if (sourceCell.hasStyle) targetCell.style = { ...sourceCell.style };
    if (sourceCell.numFmt) targetCell.numFmt = sourceCell.numFmt;
  }
}

function joinedAddress(line, legacy, city, state, pincode) {
  const parts = [line || legacy, city, state, pincode]
    .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
    .map(value => String(value).trim());
  return parts.join(', ');
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const db = supabase();
    const { data, error } = await db
      .from('employees')
      .select('*')
      .order('sr_no', { ascending: true });

    if (error) throw error;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);
    const worksheet = workbook.getWorksheet('ORIG-EMPLOYEE DATA BASE') || workbook.worksheets[0];
    if (!worksheet) throw new Error('The company Excel template has no worksheet.');

    workbook.creator = 'Employee Management System';
    workbook.created = new Date();

    // Remove any example/template pictures so only actual employee images remain.
    for (const image of worksheet.getImages()) worksheet.removeImage(image.imageId);

    // Keep the company's existing heading, merged cells, widths, borders and layout.
    // Clear sample employee values from row 10 onward without clearing cell styles.
    const templateLastRow = Math.max(worksheet.rowCount, FIRST_DATA_ROW);
    for (let rowNumber = FIRST_DATA_ROW; rowNumber <= templateLastRow; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      for (let col = 1; col <= LAST_DATA_COL; col++) {
        row.getCell(col).value = null;
      }
    }

    // Template serial row: numbered fields 1 through 32 in C:AH.
    for (let col = FIRST_DATA_COL; col <= LAST_DATA_COL; col++) {
      const cell = worksheet.getCell(9, col);
      cell.value = col - FIRST_DATA_COL + 1;
    }

    // These are the exact 32 employee fields in the supplied template, C:AH.
    // A field not present in the database (e.g. service_book_no) is blank.
    const employees = data || [];
    for (let index = 0; index < employees.length; index++) {
      const employee = employees[index];
      const rowNumber = FIRST_DATA_ROW + index;
      if (rowNumber > templateLastRow) {
        copyRowStyle(worksheet, FIRST_DATA_ROW, rowNumber);
      }

      const row = worksheet.getRow(rowNumber);
      row.height = IMAGE_ROW_POINTS;

      const values = [
        employee.site_code ?? '',                                      // C SITE CODE
        employee.sr_no ?? index + 1,                                   // D SR No-
        employee.employee_id ?? '',                                    // E EMP.ID No.
        employee.employee_name ?? '',                                  // F EMPLOYEE NAME
        employee.surname ?? '',                                        // G SURNAME
        employee.gender ?? '',                                         // H GENDER
        employee.father_spouse_name ?? '',                             // I FATHER/SPOUSE NAME
        employee.date_of_birth || '',                                  // J DATE OF BIRTH
        employee.nationality ?? '',                                    // K NATIONALITY
        employee.education_level ?? '',                                // L EDUCATION LEVEL
        employee.date_of_joining || '',                                // M DATE OF JOINING
        employee.designation ?? '',                                    // N DISIGNATION
        employee.category ?? '',                                       // O CATEGORY
        employee.type_of_employment ?? '',                             // P TYPE OF EMPLOYMENT
        employee.mobile_no ?? '',                                      // Q MOBILE No.
        employee.uan ?? '',                                            // R UAN
        employee.pan ?? '',                                            // S PAN
        employee.esic_ip ?? '',                                        // T ESIC IP
        employee.lwf ?? '',                                            // U LWF
        employee.aadhaar ?? '',                                        // V ADHAR
        employee.bank_account_no ?? '',                                // W BANK A/C No.
        employee.bank_name ?? '',                                      // X BANK NAME
        employee.ifsc_branch ?? '',                                    // Y IFSC (BRANCH)
        joinedAddress(employee.present_address_line, employee.present_address, employee.present_city, employee.present_state, employee.present_pincode), // Z PRESENT ADDRESS
        joinedAddress(employee.permanent_address_line, employee.permanent_address, employee.permanent_city, employee.permanent_state, employee.permanent_pincode), // AA PERMANENT ADDRESS
        employee.service_book_no ?? '',                                // AB SERVICE BOOK No. (blank if unavailable)
        employee.date_of_exit || '',                                   // AC DATE OF EXIT
        employee.reason_exit ?? '',                                    // AD REASON EXIT
        employee.mark_for_identification ?? '',                        // AE MARK FOR IDENTIFICATION
        '',                                                            // AF PHOTO (embedded image)
        '',                                                            // AG SPECIMAN SIGNATURE (embedded image)
        employee.remark ?? ''                                          // AH REMARK
      ];

      values.forEach((value, offset) => {
        const cell = row.getCell(FIRST_DATA_COL + offset);
        cell.value = value;
        cell.alignment = { ...(cell.alignment || {}), vertical: 'top', wrapText: true };
        if ([10, 13, 29].includes(FIRST_DATA_COL + offset) && value) {
          cell.value = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
          cell.numFmt = 'dd-mm-yyyy';
        }
      });

      const [photoUrl, signatureUrl] = await Promise.all([
        signedUrl(db, employee.photo_path),
        signedUrl(db, employee.signature_path)
      ]);

      const photoWidth = charsToPx(worksheet.getColumn(PHOTO_COL).width || 12);
      const signatureWidth = charsToPx(worksheet.getColumn(SIGNATURE_COL).width || 12);
      const imageHeight = pointsToPx(IMAGE_ROW_POINTS);

      await addFittedImage(workbook, worksheet, photoUrl, PHOTO_COL, rowNumber, photoWidth, imageHeight);
      await addFittedImage(workbook, worksheet, signatureUrl, SIGNATURE_COL, rowNumber, signatureWidth, imageHeight);
    }

    worksheet.views = [{ state: 'frozen', ySplit: 9, xSplit: 2, topLeftCell: 'C10' }];
    worksheet.autoFilter = { from: 'C8', to: 'AH8' };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-register-company-format.xlsx"');
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('Employee Excel export failed:', error);
    return res.status(500).json({ error: error.message || 'Export failed' });
  }
};
