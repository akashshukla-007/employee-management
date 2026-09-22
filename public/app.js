let employees = [];
const fields = [
  'site_code','pending_remark','employee_id','employee_name','surname','gender','blood_group','father_spouse_name',
  'date_of_birth','nationality','education_level','date_of_joining','designation','category',
  'type_of_employment','mobile_no','uan','pan','esic_ip','lwf','aadhaar','bank_account_no','bank_name',
  'ifsc_branch',
  'present_address_line','present_city','present_state','present_pincode',
  'permanent_address_line','permanent_city','permanent_state','permanent_pincode',
  'date_of_exit','reason_exit','mark_for_identification','remark'
];
const addressFields = ['present_address_line','present_city','present_state','present_pincode','permanent_address_line','permanent_city','permanent_state','permanent_pincode'];
const exportLabels = {
  site_code:'SITE CODE', pending_remark:'PENDING REMARK', employee_id:'EMP.ID No.', employee_name:'EMPLOYEE NAME', surname:'SURNAME',
  gender:'GENDER', blood_group:'BLOOD GROUP', father_spouse_name:'FATHER/SPOUSE NAME', date_of_birth:'DATE OF BIRTH', nationality:'NATIONALITY',
  education_level:'EDUCATION LEVEL', date_of_joining:'DATE OF JOINING', designation:'DISIGNATION', category:'CATEGORY',
  type_of_employment:'TYPE OF EMPLOYMENT', mobile_no:'MOBILE No.', uan:'UAN', pan:'PAN', esic_ip:'ESIC IP', lwf:'LWF',
  aadhaar:'ADHAR', bank_account_no:'BANK A/C No.', bank_name:'BANK NAME', ifsc_branch:'IFSC (BRANCH)',
  present_address_line:'PRESENT ADDRESS', present_city:'PRESENT CITY', present_state:'PRESENT STATE', present_pincode:'PRESENT PIN CODE',
  permanent_address_line:'PERMANENT ADDRESS', permanent_city:'PERMANENT CITY', permanent_state:'PERMANENT STATE', permanent_pincode:'PERMANENT PIN CODE',
  date_of_exit:'DATE OF EXITE', reason_exit:'REASON EXITE',
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
function toggleMobileNav(){ const side=$('sidebar'),back=$('mobileBackdrop'); const open=side.classList.contains('hidden'); side.classList.toggle('hidden',!open); side.classList.toggle('block',open); back.classList.toggle('hidden',!open); }
function startAdd(){resetForm();show('form');$('employee_id').focus();}
function syncPresentAddress(){
  const same=$('sameAsPermanent').checked;
  ['present_address_line','present_city','present_state','present_pincode'].forEach(id=>$(id).readOnly=same);
  if(same){$('present_address_line').value=$('permanent_address_line').value;$('present_city').value=$('permanent_city').value;$('present_state').value=$('permanent_state').value;$('present_pincode').value=$('permanent_pincode').value;}
}
function calcAge(){const v=$('date_of_birth').value;if(!v){$('age').value='';return}const d=new Date(v+'T00:00:00'),n=new Date();let a=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();if(m<0||(m===0&&n.getDate()<d.getDate()))a--; $('age').value=a>=0?a:'';}
function preview(input,id){const f=input.files[0];if(!f)return;if(f.size>5*1024*1024){toast('Image must be 5 MB or smaller.','error');input.value='';return}const img=$(id);img.src=URL.createObjectURL(f);img.classList.remove('hiddenx');}
function resetForm(){$('employeeForm').reset();$('editId').value='';$('age').value='';$('nationality').value='IND';$('photoPreview').removeAttribute('src');$('photoPreview').classList.add('hiddenx');$('signaturePreview').removeAttribute('src');$('signaturePreview').classList.add('hiddenx');$('formMsg').textContent='';$('saveBtn').disabled=false;$('sameAsPermanent').checked=false;addressFields.filter(k=>k.startsWith('present_')).forEach(k=>$(k).readOnly=false);}
function fill(e){$('editId').value=e.id;fields.forEach(k=>{const el=$(k);if(el)el.value=e[k]??''});calcAge();$('photoPreview').src=e.photo_url||'';$('photoPreview').classList.toggle('hiddenx',!e.photo_url);$('signaturePreview').src=e.signature_url||'';$('signaturePreview').classList.toggle('hiddenx',!e.signature_url);
  const presentMatchesPermanent=['address_line','city','state','pincode'].every(s=>(e['present_'+s]||'')===(e['permanent_'+s]||'')) && !!(e.permanent_address_line);
  $('sameAsPermanent').checked=presentMatchesPermanent; syncPresentAddress();
  show('form');}
function editEmployee(id){const e=employees.find(x=>x.id===id);if(e)fill(e);}
async function saveEmployee(ev){
  ev.preventDefault(); const btn=$('saveBtn'); btn.disabled=true; $('formMsg').textContent='Saving employee...'; $('formMsg').className='text-sm mt-3 text-slate-500';
  try{
    const body={}; fields.forEach(k=>body[k]=$(k)?.value||null); if(body.aadhaar) body.aadhaar=body.aadhaar.replace(/\D/g,''); const id=$('editId').value;
    const d=await api(id?'/api/employees?id='+encodeURIComponent(id):'/api/employees',{method:id?'PUT':'POST',body:JSON.stringify(body)}); const emp=d.data;
    for(const [type,inputId] of [['photo','photo'],['signature','signature']]){const f=$(inputId).files[0];if(f){const data=await toDataUrl(f);await api('/api/upload',{method:'POST',body:JSON.stringify({employeeId:emp.employee_id,type,data,mimeType:f.type})});}}
    $('formMsg').textContent='Employee saved successfully.';$('formMsg').className='text-sm mt-3 text-emerald-600'; toast('Employee saved.','success'); await load(); setTimeout(()=>{resetForm();show('employees')},450);
  }catch(e){$('formMsg').textContent=e.message;$('formMsg').className='text-sm mt-3 text-red-600';btn.disabled=false;}
}
function toDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
async function deleteEmployee(id){const e=employees.find(x=>x.id===id);if(!confirm(`Delete ${e?.employee_name||'this employee'} permanently?`))return;try{await api('/api/employees?id='+encodeURIComponent(id),{method:'DELETE'});toast('Employee deleted.','success');await load()}catch(e){toast(e.message,'error')}}
function joinAddress(e,prefix){return [e[prefix+'_address_line'],e[prefix+'_city'],e[prefix+'_state'],e[prefix+'_pincode']].filter(Boolean).join(', ')||'—';}
function viewEmployee(id){const e=employees.find(x=>x.id===id);if(!e)return;$('profileTitle').textContent=`${e.employee_name||'Employee'} · ${e.employee_id||''}`;const image=e.photo_url?`<img src="${escAttr(e.photo_url)}" class="w-28 h-32 object-cover rounded-xl border" alt="Photo">`:'<div class="w-28 h-32 rounded-xl border bg-slate-50 flex items-center justify-center text-slate-400 text-xs">No photo</div>';const sig=e.signature_url?`<img src="${escAttr(e.signature_url)}" class="w-56 h-24 object-contain rounded-xl border" alt="Signature">`:'<div class="w-56 h-24 rounded-xl border bg-slate-50 flex items-center justify-center text-slate-400 text-xs">No signature</div>';$('profileBody').innerHTML=`<div class="grid lg:grid-cols-[160px_1fr] gap-6 mb-6"><div>${image}</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${detail('Employee ID',e.employee_id)}${detail('Site Code',e.site_code)}${detail('Designation',e.designation)}${detail('Status',e.date_of_exit?'Exited':'Active')}${detail('Age',e.age)}${detail('Blood Group',e.blood_group)}${detail('Date of Joining',fmtDate(e.date_of_joining))}</div></div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${fields.filter(k=>!['employee_id','site_code','designation','date_of_joining','blood_group',...addressFields].includes(k)).map(k=>detail(exportLabels[k]||k.replaceAll('_',' '),k.startsWith('date_')?fmtDate(e[k]):e[k])).join('')}</div><div class="grid sm:grid-cols-2 gap-4 mt-4">${detail('Permanent Address',joinAddress(e,'permanent'))}${detail('Present Address',joinAddress(e,'present'))}</div><div class="mt-6"><div class="text-sm font-bold mb-2">Specimen Signature</div>${sig}</div><div class="mt-6 flex gap-2"><button onclick="editEmployee('${e.id}');closeProfile()" class="bg-indigo-600 text-white px-4 py-2 rounded-xl">Edit</button><button onclick="window.print()" class="border px-4 py-2 rounded-xl">Print</button></div>`;$('profileModal').classList.remove('hiddenx');}
function detail(label,value){return `<div><div class="text-xs font-semibold uppercase text-slate-400">${esc(label)}</div><div class="mt-1 text-sm whitespace-pre-wrap break-words">${esc(value??'—')}</div></div>`}
function closeProfile(){$('profileModal').classList.add('hiddenx')}
async function exportExcel(){try{toast('Preparing Excel...','info');const r=await fetch('/api/export',{credentials:'same-origin'});if(!r.ok){const d=await r.json();throw new Error(d.error||'Export failed')}const b=await r.blob();const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='employee-database-export.xlsx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Excel downloaded.','success')}catch(e){toast(e.message,'error')}}
// Column headers exactly as api/export.js writes them (newlines collapsed to
// spaces by normHeader below), used to locate each field's column by name
// rather than by a fixed position -- so import keeps working if columns are
// ever added, removed or reordered in the export layout.
const normHeader=v=>String(v||'').replace(/\n/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
const importHeaders={
  site_code:'SITE CODE', pending_remark:'PENDING REMARK', employee_id:'EMP.ID NO.',
  employee_name:'EMPLOYEE NAME', surname:'SURNAME', gender:'GENDER', blood_group:'BLOOD GROUP',
  father_spouse_name:'FATHER/SPOUSE NAME', date_of_birth:'DATE OF BIRTH', nationality:'NATIONALITY',
  education_level:'EDUCATION LEVEL', date_of_joining:'DATE OF JOINING', designation:'DISIGNATION',
  category:'CATEGORY MS/S/SS/US', type_of_employment:'TYPE OF EMPLOYMENT', mobile_no:'MOBILE NO.',
  uan:'UAN', pan:'PAN', esic_ip:'ESIC IP', lwf:'LWF', aadhaar:'ADHAR', bank_account_no:'BANK A/C NO.',
  bank_name:'BANK NAME', ifsc_branch:'IFSC (BRANCH)',
  present_address_line:'PRESENT ADDRESS', present_city:'PRESENT CITY', present_state:'PRESENT STATE', present_pincode:'PRESENT PIN CODE',
  permanent_address_line:'PERMANENT ADDRESS', permanent_city:'PERMANENT CITY', permanent_state:'PERMANENT STATE', permanent_pincode:'PERMANENT PIN CODE',
  date_of_exit:'DATE OF EXITE', reason_exit:'REASON EXITE', mark_for_identification:'MARK FOR IDENTIFICATION', remark:'REMARK'
};
async function importExcel(file){
  if(!file)return; if(!confirm('Import employee rows from this Excel file? Existing Employee IDs and Aadhaar numbers will be skipped.'))return;
  try{
    toast('Reading Excel...','info');const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array',cellDates:true});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    const hdr=rows.findIndex(r=>r.some(cell=>normHeader(cell)==='EMP.ID NO.'));
    if(hdr<0) throw new Error('Could not find the master header row (expected an "EMP.ID No." column).');
    const headerRow=rows[hdr];
    const colIndex={};
    Object.entries(importHeaders).forEach(([key,label])=>{const idx=headerRow.findIndex(cell=>normHeader(cell)===label);if(idx>=0)colIndex[key]=idx;});
    const get=(r,key)=>colIndex[key]!==undefined?r[colIndex[key]]:'';
    // Row immediately after the header is the field-serial-number row in the master layout; real data begins after that.
    const dataRows=rows.slice(hdr+2);
    let imported=0, skipped=0, failed=0, errors=[];
    for(const r of dataRows){
      const id=String(get(r,'employee_id')??'').trim();if(!id)continue;
      const body={
        site_code:get(r,'site_code'), pending_remark:get(r,'pending_remark'), employee_id:id,
        employee_name:get(r,'employee_name'), surname:get(r,'surname'), gender:get(r,'gender'), blood_group:get(r,'blood_group'),
        father_spouse_name:get(r,'father_spouse_name'), date_of_birth:excelDate(get(r,'date_of_birth')), nationality:get(r,'nationality'),
        education_level:get(r,'education_level'), date_of_joining:excelDate(get(r,'date_of_joining')), designation:get(r,'designation'),
        category:get(r,'category'), type_of_employment:get(r,'type_of_employment'), mobile_no:String(get(r,'mobile_no')??''),
        uan:String(get(r,'uan')??''), pan:String(get(r,'pan')??''), esic_ip:String(get(r,'esic_ip')??''), lwf:String(get(r,'lwf')??''),
        aadhaar:String(get(r,'aadhaar')??'').replace(/\D/g,''), bank_account_no:String(get(r,'bank_account_no')??''),
        bank_name:get(r,'bank_name'), ifsc_branch:get(r,'ifsc_branch'),
        present_address_line:get(r,'present_address_line'), present_city:get(r,'present_city'), present_state:get(r,'present_state'), present_pincode:get(r,'present_pincode'),
        permanent_address_line:get(r,'permanent_address_line'), permanent_city:get(r,'permanent_city'), permanent_state:get(r,'permanent_state'), permanent_pincode:get(r,'permanent_pincode'),
        date_of_exit:excelDate(get(r,'date_of_exit')), reason_exit:get(r,'reason_exit'), mark_for_identification:get(r,'mark_for_identification'), remark:get(r,'remark')
      };
      try{await api('/api/employees',{method:'POST',body:JSON.stringify(body)});imported++}catch(e){if(e.message.includes('already exists'))skipped++;else{failed++;if(errors.length<5)errors.push(`${id}: ${e.message}`)}}
    }
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
