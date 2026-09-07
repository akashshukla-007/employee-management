let employees = [];
const fields = [
  'site_code','pending_remark','employee_id','employee_name','surname','gender','father_spouse_name',
  'date_of_birth','nationality','education_level','date_of_joining','designation','category',
  'type_of_employment','mobile_no','uan','pan','esic_ip','lwf','aadhaar','bank_account_no','bank_name',
  'ifsc_branch','present_address','permanent_address','service_book_no','date_of_exit','reason_exit',
  'mark_for_identification','remark'
];
const exportLabels = {
  site_code:'SITE CODE', pending_remark:'PENDING REMARK', employee_id:'EMP.ID No.', employee_name:'EMPLOYEE NAME', surname:'SURNAME',
  gender:'GENDER', father_spouse_name:'FATHER/SPOUSE NAME', date_of_birth:'DATE OF BIRTH', nationality:'NATIONALITY',
  education_level:'EDUCATION LEVEL', date_of_joining:'DATE OF JOINING', designation:'DISIGNATION', category:'CATEGORY',
  type_of_employment:'TYPE OF EMPLOYMENT', mobile_no:'MOBILE No.', uan:'UAN', pan:'PAN', esic_ip:'ESIC IP', lwf:'LWF',
  aadhaar:'ADHAR', bank_account_no:'BANK A/C No.', bank_name:'BANK NAME', ifsc_branch:'IFSC (BRANCH)', present_address:'PRESENT ADRESS',
  permanent_address:'PERMANENT ADDRESS', service_book_no:'SERVICE BOOK No.', date_of_exit:'DATE OF EXITE', reason_exit:'REASON EXITE',
  mark_for_identification:'MARK FOR IDENTIFICATION', remark:'REMARK'
};

const $ = id => document.getElementById(id);
async function api(url, options = {}) {
  const opts = { credentials:'same-origin', ...options };
  opts.headers = { ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(options.headers||{}) };
  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  const d = ct.includes('json') ? await r.json() : await r.blob();
  if (!r.ok) throw new Error(d?.error || 'Request failed');
  return d;
}

async function login(ev) {
  ev.preventDefault(); $('loginErr').textContent = '';
  try { await api('/api/login',{method:'POST',body:JSON.stringify({password:$('loginPass').value})}); $('login').classList.add('hiddenx'); $('app').classList.remove('hiddenx'); await load(); }
  catch(e){ $('loginErr').textContent=e.message; }
}
async function logout(){ try{await api('/api/logout',{method:'POST'});}finally{location.reload();} }
async function boot(){ try{await api('/api/me'); $('login').classList.add('hiddenx'); $('app').classList.remove('hiddenx'); await load();}catch(_){} }

async function load(){
  try { const d=await api('/api/employees'); employees=d.data||[]; updateDash(); renderTable(); }
  catch(e){ if(e.message!=='Unauthorized') toast(e.message,'error'); }
}
function updateDash(){
  $('total').textContent=employees.length;
  $('active').textContent=employees.filter(e=>!e.date_of_exit).length;
  $('exited').textContent=employees.filter(e=>e.date_of_exit).length;
  const now=new Date(); $('monthAdded').textContent=employees.filter(e=>{const d=new Date(e.created_at);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()}).length;
  const recent=[...employees].slice(-6).reverse(); $('recent').innerHTML=recent.length?recent.map(e=>`<div class="py-3 flex items-center justify-between gap-4"><div><div class="font-semibold">${esc(e.employee_name||'Unnamed')}</div><div class="text-xs text-slate-500">${esc(e.employee_id||'')} · ${esc(e.designation||'No designation')}</div></div><div class="text-xs text-slate-500">${esc(e.site_code||'')}</div></div>`).join(''):'<div class="py-6 text-slate-500 text-sm">No employees yet.</div>';
}
function renderTable(){
  const q=($('search')?.value||'').trim().toLowerCase(); const arr=employees.filter(e=>!q||[e.employee_id,e.employee_name,e.site_code,e.designation,e.mobile_no,e.surname].join(' ').toLowerCase().includes(q));
  $('countLabel').textContent=`Showing ${arr.length} of ${employees.length}`;
  $('tbody').innerHTML=arr.map(e=>`<tr class="border-b hover:bg-slate-50"><td class="p-3">${e.sr_no??''}</td><td class="p-3 font-semibold">${esc(e.employee_id||'')}</td><td class="p-3"><button class="text-indigo-700 hover:underline font-semibold" onclick="viewEmployee('${e.id}')">${esc(e.employee_name||'-')}</button></td><td class="p-3">${esc(e.site_code||'')}</td><td class="p-3">${esc(e.designation||'')}</td><td class="p-3">${esc(e.mobile_no||'')}</td><td class="p-3">${e.date_of_exit?'<span class="inline-flex px-2 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold">Exited</span>':'<span class="inline-flex px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">Active</span>'}</td><td class="p-3 whitespace-nowrap"><button class="text-indigo-600 mr-3" onclick="editEmployee('${e.id}')">Edit</button><button class="text-red-600" onclick="deleteEmployee('${e.id}')">Delete</button></td></tr>`).join('')||'<tr><td colspan="8" class="p-8 text-center text-slate-500">No records found.</td></tr>';
}
function show(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hiddenx',v.id!==id));
  const titles={dashboard:'Dashboard',employees:'Employees',form:$('editId').value?'Edit Employee':'Add Employee'}; $('title').textContent=titles[id]||'Employee Management';
  document.querySelectorAll('.navbtn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  if(id==='employees') renderTable(); if(id==='dashboard') updateDash();
  $('sidebar')?.classList.remove('block');
}
function toggleMobileNav(){ $('sidebar').classList.toggle('block'); $('sidebar').classList.toggle('hidden'); }
function startAdd(){resetForm();show('form');$('employee_id').focus();}
function calcAge(){const v=$('date_of_birth').value;if(!v){$('age').value='';return}const d=new Date(v+'T00:00:00'),n=new Date();let a=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();if(m<0||(m===0&&n.getDate()<d.getDate()))a--; $('age').value=a>=0?a:'';}
function preview(input,id){const f=input.files[0];if(!f)return;if(f.size>5*1024*1024){toast('Image must be 5 MB or smaller.','error');input.value='';return}const img=$(id);img.src=URL.createObjectURL(f);img.classList.remove('hiddenx');}
function resetForm(){$('employeeForm').reset();$('editId').value='';$('age').value='';$('nationality').value='IND';$('photoPreview').removeAttribute('src');$('photoPreview').classList.add('hiddenx');$('signaturePreview').removeAttribute('src');$('signaturePreview').classList.add('hiddenx');$('formMsg').textContent='';$('saveBtn').disabled=false;}
function fill(e){$('editId').value=e.id;fields.forEach(k=>{const el=$(k);if(el)el.value=e[k]??''});calcAge();$('photoPreview').src=e.photo_url||'';$('photoPreview').classList.toggle('hiddenx',!e.photo_url);$('signaturePreview').src=e.signature_url||'';$('signaturePreview').classList.toggle('hiddenx',!e.signature_url);show('form');}
function editEmployee(id){const e=employees.find(x=>x.id===id);if(e)fill(e);}
async function saveEmployee(ev){
  ev.preventDefault(); const btn=$('saveBtn'); btn.disabled=true; $('formMsg').textContent='Saving employee...'; $('formMsg').className='text-sm mt-3 text-slate-500';
  try{
    const body={}; fields.forEach(k=>body[k]=$(k)?.value||null); const id=$('editId').value;
    const d=await api(id?'/api/employees?id='+encodeURIComponent(id):'/api/employees',{method:id?'PUT':'POST',body:JSON.stringify(body)}); const emp=d.data;
    for(const [type,inputId] of [['photo','photo'],['signature','signature']]){const f=$(inputId).files[0];if(f){const data=await toDataUrl(f);await api('/api/upload',{method:'POST',body:JSON.stringify({employeeId:emp.employee_id,type,data,mimeType:f.type})});}}
    $('formMsg').textContent='Employee saved successfully.';$('formMsg').className='text-sm mt-3 text-emerald-600'; toast('Employee saved.','success'); await load(); setTimeout(()=>{resetForm();show('employees')},450);
  }catch(e){$('formMsg').textContent=e.message;$('formMsg').className='text-sm mt-3 text-red-600';btn.disabled=false;}
}
function toDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
async function deleteEmployee(id){const e=employees.find(x=>x.id===id);if(!confirm(`Delete ${e?.employee_name||'this employee'} permanently?`))return;try{await api('/api/employees?id='+encodeURIComponent(id),{method:'DELETE'});toast('Employee deleted.','success');await load()}catch(e){toast(e.message,'error')}}
function viewEmployee(id){const e=employees.find(x=>x.id===id);if(!e)return;$('profileTitle').textContent=`${e.employee_name||'Employee'} · ${e.employee_id||''}`;const image=e.photo_url?`<img src="${escAttr(e.photo_url)}" class="w-28 h-32 object-cover rounded-xl border" alt="Photo">`:'<div class="w-28 h-32 rounded-xl border bg-slate-50 flex items-center justify-center text-slate-400 text-xs">No photo</div>';const sig=e.signature_url?`<img src="${escAttr(e.signature_url)}" class="w-56 h-24 object-contain rounded-xl border" alt="Signature">`:'<div class="w-56 h-24 rounded-xl border bg-slate-50 flex items-center justify-center text-slate-400 text-xs">No signature</div>';$('profileBody').innerHTML=`<div class="grid lg:grid-cols-[160px_1fr] gap-6 mb-6"><div>${image}</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${detail('Employee ID',e.employee_id)}${detail('Site Code',e.site_code)}${detail('Designation',e.designation)}${detail('Status',e.date_of_exit?'Exited':'Active')}${detail('Age',e.age)}${detail('Date of Joining',fmtDate(e.date_of_joining))}</div></div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${fields.filter(k=>!['employee_id','site_code','designation','date_of_joining'].includes(k)).map(k=>detail(exportLabels[k]||k.replaceAll('_',' '),k.startsWith('date_')?fmtDate(e[k]):e[k])).join('')}</div><div class="mt-6"><div class="text-sm font-bold mb-2">Specimen Signature</div>${sig}</div><div class="mt-6 flex gap-2"><button onclick="editEmployee('${e.id}');closeProfile()" class="bg-indigo-600 text-white px-4 py-2 rounded-xl">Edit</button><button onclick="window.print()" class="border px-4 py-2 rounded-xl">Print</button></div>`;$('profileModal').classList.remove('hiddenx');}
function detail(label,value){return `<div><div class="text-xs font-semibold uppercase text-slate-400">${esc(label)}</div><div class="mt-1 text-sm whitespace-pre-wrap break-words">${esc(value??'—')}</div></div>`}
function closeProfile(){$('profileModal').classList.add('hiddenx')}
async function exportExcel(){try{toast('Preparing Excel...','info');const r=await fetch('/api/export',{credentials:'same-origin'});if(!r.ok){const d=await r.json();throw new Error(d.error||'Export failed')}const b=await r.blob();const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='employee-database-export.xlsx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Excel downloaded.','success')}catch(e){toast(e.message,'error')}}
async function importExcel(file){
  if(!file)return; if(!confirm('Import employee rows from this Excel file? Existing Employee IDs will be skipped.'))return;
  try{
    toast('Reading Excel...','info');const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array',cellDates:true});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    const hdr=rows.findIndex(r=>String(r[4]||'').toLowerCase().includes('sr no')); if(hdr<0)throw new Error('Could not find the master header row.');
    let imported=0, skipped=0, failed=0, errors=[]; const dataRows=rows.slice(hdr+2);
    for(const r of dataRows){const id=String(r[5]??'').trim();if(!id)continue;const body={site_code:r[2],pending_remark:r[3],employee_id:id,employee_name:r[6],surname:r[7],gender:r[8],father_spouse_name:r[9],date_of_birth:excelDate(r[10]),nationality:r[11],education_level:r[12],date_of_joining:excelDate(r[13]),designation:r[14],category:r[15],type_of_employment:r[16],mobile_no:String(r[17]??''),uan:String(r[18]??''),pan:String(r[19]??''),esic_ip:String(r[20]??''),lwf:String(r[21]??''),aadhaar:String(r[22]??''),bank_account_no:String(r[23]??''),bank_name:r[24],ifsc_branch:r[25],present_address:r[26],permanent_address:r[27],service_book_no:r[28],date_of_exit:excelDate(r[29]),reason_exit:r[30],mark_for_identification:r[31],remark:r[34]};try{await api('/api/employees',{method:'POST',body:JSON.stringify(body)});imported++}catch(e){if(e.message.includes('already exists'))skipped++;else{failed++;if(errors.length<5)errors.push(`${id}: ${e.message}`)}}}
    await load();show('employees');toast(`Import complete · Imported ${imported}, skipped ${skipped}, failed ${failed}`,'success');if(errors.length)alert('Some rows failed:\n\n'+errors.join('\n'));
  }catch(e){toast(e.message,'error')}
}
function excelDate(v){if(!v)return null;if(v instanceof Date)return isNaN(v)?null:v.toISOString().slice(0,10);if(typeof v==='number'){const d=new Date(Math.round((v-25569)*86400*1000));return isNaN(d)?null:d.toISOString().slice(0,10)}const s=String(v).trim();return s?s.slice(0,10):null}
function fmtDate(v){if(!v)return '—';const d=new Date(v+'T00:00:00');return isNaN(d)?v:d.toLocaleDateString('en-GB')}
function toast(msg,type='info'){const t=$('toast');const cls=type==='error'?'bg-red-600':type==='success'?'bg-emerald-600':'bg-slate-900';t.innerHTML=`<div class="${cls} text-white px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm">${esc(msg)}</div>`;t.classList.remove('hiddenx');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.add('hiddenx'),3500)}
function esc(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function escAttr(v){return esc(v)}
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeProfile()});
boot();
