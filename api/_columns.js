// Canonical employee register column layout (source of truth for both
// api/export.js writing the workbook and api/import.js reading it back).
// Keeping this in one place means header text, order, and the photo/signature
// column positions can never drift between export and import.
const EXPORT_COLUMNS = [
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
  { key: 'date_of_exit', header: 'DATE OF EXIT' },
  { key: 'reason_exit', header: 'REASON FOR EXIT' },
  { key: 'mark_for_identification', header: 'MARK FOR IDENTIFICATION' },
  { key: 'photo', header: 'PHOTO' },
  { key: 'signature', header: 'SPECIMAN SIGNATURE' },
  { key: 'remark', header: 'REMARK' },
  { key: 'age', header: 'AGE ON CURRENT DATE' }
];

// Date fields that ExcelJS/JS may hand back as Date objects and that the
// database expects as 'YYYY-MM-DD' text.
const DATE_KEYS = ['date_of_birth', 'date_of_joining', 'date_of_exit'];

function normHeader(v) {
  return String(v || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

module.exports = { EXPORT_COLUMNS, DATE_KEYS, normHeader };
