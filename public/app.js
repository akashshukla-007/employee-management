let employees = [];
let filteredEmployees = [];
let docCounts = {}; // employee_id -> { joining_form: n, f11: n }
let currentPage = 1;
const PAGE_SIZE = 10;
let quickDocFilter = null; // 'missing_photo' | 'missing_signature' | null
let currentProfileEmployeeId = null;

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
function fullName(e){ return [e.employee_name, e.surname].filter(Boolean).join(' ').trim() || 'Unnamed'; }
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
async function boot(){ $('year').textContent=new Date().getFullYear(); try{await api('/api/me'); $('login').classList.add('hiddenx'); $('app').classList.remove('hiddenx'); await load();}catch(_){} }

async function load(){
  try {
    const [empRes] = await Promise.all([api('/api/employees'), loadDocumentCounts()]);
    employees = empRes.data || [];
    populateDeptFilter();
    updateDash();
    onFilterChange();
  } catch(e){ if(e.message!=='Unauthorized') toast(e.message,'error'); }
}
async function loadDocumentCounts(){
  try{
    const d = await api('/api/documents');
    const counts = {};
    (d.data||[]).forEach(row=>{ counts[row.employee_id] = counts[row.employee_id] || {joining_form:0, f11:0}; counts[row.employee_id][row.category] = (counts[row.employee_id][row.category]||0)+1; });
    docCounts = counts;
  }catch(e){ /* non-fatal: document badges just won't show counts */ }
}

function updateDash(){
  $('statTotal').textContent=employees.length;
  $('statActive').textContent=employees.filter(e=>!e.date_of_exit).length;
  $('statExited').textContent=employees.filter(e=>e.date_of_exit).length;
  const depts={}; employees.forEach(e=>{ if(e.site_code) depts[e.site_code]=(depts[e.site_code]||0)+1; });
  $('statDepts').textContent=Object.keys(depts).length;
  const recent=[...employees].slice(-6).reverse();
  $('recent').innerHTML=recent.length?recent.map(e=>`<div class="py-3 flex items-center justify-between gap-4"><div><div class="font-semibold">${esc(fullName(e))}</div><div class="text-xs text-slate-500">${esc(e.employee_id||'')} · ${esc(e.designation||'No designation')}</div></div><div class="text-xs text-slate-500">${esc(e.site_code||'')}</div></div>`).join(''):'<div class="py-6 text-slate-500 text-sm">No employees yet.</div>';
}

function onGlobalSearch(){ show('employees'); $('search').value=$('globalSearch').value; onFilterChange(); }
function onFilterChange(){ currentPage=1; renderTable(); }
function resetFilters(){ $('search').value=''; $('filterDept').value=''; $('filterStatus').value=''; $('globalSearch').value=''; quickDocFilter=null; currentPage=1; renderTable(); }
function toggleQuickDoc(kind){ quickDocFilter = quickDocFilter===kind ? null : kind; currentPage=1; renderTable(); }
function populateDeptFilter(){
  const sel=$('filterDept'); const current=sel.value;
  const depts=[...new Set(employees.map(e=>e.site_code).filter(Boolean))].sort();
  sel.innerHTML='<option value="">All Site Codes</option>'+depts.map(d=>`<option value="${escAttr(d)}">${esc(d)}</option>`).join('');
  if(depts.includes(current)) sel.value=current;
}
function applyFilters(){
  const q=($('search')?.value||'').trim().toLowerCase();
  const dept=$('filterDept')?.value||'';
  const status=$('filterStatus')?.value||'';
  return employees.filter(e=>{
    if(q && ![e.employee_id,fullName(e),e.site_code,e.designation,e.mobile_no].join(' ').toLowerCase().includes(q)) return false;
    if(dept && e.site_code!==dept) return false;
    if(status==='active' && e.date_of_exit) return false;
    if(status==='exited' && !e.date_of_exit) return false;
    if(quickDocFilter==='missing_photo' && e.photo_url) return false;
    if(quickDocFilter==='missing_signature' && e.signature_url) return false;
    return true;
  });
}
function docBadges(employeeId){
  const c=docCounts[employeeId]||{joining_form:0,f11:0};
  return `<span class="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5">JF ${c.joining_form||0}</span><span class="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5">F11 ${c.f11||0}</span>`;
}
function renderTable(){
  filteredEmployees = applyFilters();
  const total = employees.length, shown = filteredEmployees.length;
  $('countLabel').textContent = `Showing ${shown} of ${total} records`;
  const totalPages = Math.max(1, Math.ceil(shown / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageItems = filteredEmployees.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);

  $('tbody').innerHTML = pageItems.map(e => `
    <tr class="border-b hover:bg-slate-50">
      <td class="p-3">${e.photo_url?`<img src="${escAttr(e.photo_url)}" class="w-10 h-10 rounded-lg object-cover border" alt="">`:'<div class="w-10 h-10 rounded-lg border bg-slate-50"></div>'}</td>
      <td class="p-3 font-semibold whitespace-nowrap">${esc(e.employee_id||'')}</td>
      <td class="p-3"><button class="text-indigo-700 hover:underline font-semibold text-left" onclick="viewEmployee('${e.id}')">${esc(fullName(e))}</button></td>
      <td class="p-3"><div>${esc(e.site_code||'—')}</div><div class="text-xs text-slate-500">${esc(e.designation||'')}</div></td>
      <td class="p-3">${esc(e.mobile_no||'—')}</td>
      <td class="p-3 whitespace-nowrap">${fmtDate(e.date_of_joining)}</td>
      <td class="p-3"><div class="flex flex-wrap gap-1">${docBadges(e.employee_id)}<span class="text-xs border rounded-full px-2 py-0.5 ${e.photo_url?'text-emerald-700':'text-slate-400'}">${e.photo_url?'Photo ✓':'Photo ✗'}</span><span class="text-xs border rounded-full px-2 py-0.5 ${e.signature_url?'text-emerald-700':'text-slate-400'}">${e.signature_url?'Sign ✓':'Sign ✗'}</span></div></td>
      <td class="p-3">${e.date_of_exit?'<span class="inline-flex px-2 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold">Exited</span>':'<span class="inline-flex px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">Active</span>'}</td>
      <td class="p-3 whitespace-nowrap"><button class="iconbtn mr-1" title="View" onclick="viewEmployee('${e.id}')">👁</button><button class="iconbtn mr-1" title="Edit" onclick="editEmployee('${e.id}')">✏️</button><button class="iconbtn text-red-600" title="Delete" onclick="deleteEmployee('${e.id}')">🗑</button></td>
    </tr>`).join('') || '<tr><td colspan="9" class="p-8 text-center text-slate-500">No records found.</td></tr>';

  const missingPhoto = employees.filter(e=>!e.photo_url).length;
  const missingSig = employees.filter(e=>!e.signature_url).length;
  $('quickFocus').innerHTML = [
    `<button onclick="$('filterStatus').value='active';onFilterChange()" class="text-xs border rounded-full px-3 py-1.5 bg-white hover:bg-slate-50">Active: ${employees.filter(e=>!e.date_of_exit).length}</button>`,
    `<button onclick="$('filterStatus').value='exited';onFilterChange()" class="text-xs border rounded-full px-3 py-1.5 bg-white hover:bg-slate-50">Exited: ${employees.filter(e=>e.date_of_exit).length}</button>`,
    `<button onclick="toggleQuickDoc('missing_photo')" class="text-xs border rounded-full px-3 py-1.5 ${quickDocFilter==='missing_photo'?'bg-indigo-600 text-white':'bg-white hover:bg-slate-50'}">Missing Photo: ${missingPhoto}</button>`,
    `<button onclick="toggleQuickDoc('missing_signature')" class="text-xs border rounded-full px-3 py-1.5 ${quickDocFilter==='missing_signature'?'bg-indigo-600 text-white':'bg-white hover:bg-slate-50'}">Missing Signature: ${missingSig}</button>`
  ].join('');

  $('pagination').innerHTML = shown ? `
    <div class="text-slate-500">Page ${currentPage} of ${totalPages}</div>
    <div class="flex gap-2">
      <button ${currentPage<=1?'disabled':''} onclick="currentPage--;renderTable()" class="border rounded-lg px-3 py-1.5 bg-white disabled:opacity-40">Prev</button>
      <button ${currentPage>=totalPages?'disabled':''} onclick="currentPage++;renderTable()" class="border rounded-lg px-3 py-1.5 bg-white disabled:opacity-40">Next</button>
    </div>` : '';
}

function show(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hiddenx',v.id!==id));
  document.querySelectorAll('.navtab[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  if(id==='employees') renderTable(); if(id==='dashboard') updateDash();
}
function toggleMobileNav(){ $('mobileNav').classList.toggle('hiddenx'); }

function startAdd(){resetForm();show('form');$('docHint').classList.remove('hiddenx');$('employee_id').focus();}
function syncPresentAddress(){
  const same=$('sameAsPermanent').checked;
  ['present_address_line','present_city','present_state','present_pincode'].forEach(id=>$(id).readOnly=same);
  if(same){$('present_address_line').value=$('permanent_address_line').value;$('present_city').value=$('permanent_city').value;$('present_state').value=$('permanent_state').value;$('present_pincode').value=$('permanent_pincode').value;}
}
function calcAge(){
  const v=$('date_of_birth').value; const warn=$('ageWarning');
  if(!v){$('age').value='';warn.classList.add('hiddenx');return}
  const d=new Date(v+'T00:00:00'),n=new Date();let a=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();if(m<0||(m===0&&n.getDate()<d.getDate()))a--;
  $('age').value=a>=0?a:'';
  if(a<18){warn.textContent='⚠️ Warning: Age below 18 years';warn.className='sm:col-span-2 lg:col-span-3 text-sm font-semibold text-amber-600';warn.classList.remove('hiddenx');}
  else if(a>58){warn.textContent='⚠️ Warning: Age above 58 years';warn.className='sm:col-span-2 lg:col-span-3 text-sm font-semibold text-amber-600';warn.classList.remove('hiddenx');}
  else warn.classList.add('hiddenx');
}
function preview(input,id){
  const f=input.files[0];if(!f)return;if(f.size>5*1024*1024){toast('Image must be 5 MB or smaller.','error');input.value='';return}
  cameraPendingData[id==='photoPreview'?'photo':'signature']=null; // manual file selection overrides any camera capture
  const img=$(id);img.src=URL.createObjectURL(f);img.classList.remove('hiddenx');
}
function resetForm(){
  $('employeeForm').reset();$('editId').value='';$('age').value='';$('nationality').value='IND';
  $('photoPreview').removeAttribute('src');$('photoPreview').classList.add('hiddenx');
  $('signaturePreview').removeAttribute('src');$('signaturePreview').classList.add('hiddenx');
  $('formMsg').textContent='';$('saveBtn').disabled=false;$('sameAsPermanent').checked=false;
  $('ageWarning').classList.add('hiddenx');$('docHint').classList.add('hiddenx');
  addressFields.filter(k=>k.startsWith('present_')).forEach(k=>$(k).readOnly=false);
  cameraPendingData={photo:null,signature:null};
}
function fill(e){
  $('editId').value=e.id;fields.forEach(k=>{const el=$(k);if(el)el.value=e[k]??''});calcAge();
  $('photoPreview').src=e.photo_url||'';$('photoPreview').classList.toggle('hiddenx',!e.photo_url);
  $('signaturePreview').src=e.signature_url||'';$('signaturePreview').classList.toggle('hiddenx',!e.signature_url);
  const presentMatchesPermanent=['address_line','city','state','pincode'].every(s=>(e['present_'+s]||'')===(e['permanent_'+s]||'')) && !!(e.permanent_address_line);
  $('sameAsPermanent').checked=presentMatchesPermanent; syncPresentAddress();
  cameraPendingData={photo:null,signature:null};
  $('docHint').classList.remove('hiddenx');
  show('form');
}
function editEmployee(id){const e=employees.find(x=>x.id===id);if(e)fill(e);}
async function saveEmployee(ev){
  ev.preventDefault(); const btn=$('saveBtn'); btn.disabled=true; $('formMsg').textContent='Saving employee...'; $('formMsg').className='text-sm mt-3 text-slate-500';
  try{
    const body={}; fields.forEach(k=>body[k]=$(k)?.value||null); if(body.aadhaar) body.aadhaar=body.aadhaar.replace(/\D/g,''); const id=$('editId').value;
    const d=await api(id?'/api/employees?id='+encodeURIComponent(id):'/api/employees',{method:id?'PUT':'POST',body:JSON.stringify(body)}); const emp=d.data;
    for(const type of ['photo','signature']){
      const camData=cameraPendingData[type];
      if(camData){ await api('/api/upload',{method:'POST',body:JSON.stringify({employeeId:emp.employee_id,type,data:camData,mimeType:'image/jpeg'})}); continue; }
      const f=$(type).files[0];
      if(f){ const data=await toDataUrl(f); await api('/api/upload',{method:'POST',body:JSON.stringify({employeeId:emp.employee_id,type,data,mimeType:f.type})}); }
    }
    $('formMsg').textContent='Employee saved successfully.';$('formMsg').className='text-sm mt-3 text-emerald-600'; toast('Employee saved.','success'); await load(); setTimeout(()=>{resetForm();show('employees')},450);
  }catch(e){$('formMsg').textContent=e.message;$('formMsg').className='text-sm mt-3 text-red-600';btn.disabled=false;}
}
function toDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
async function deleteEmployee(id){const e=employees.find(x=>x.id===id);if(!confirm(`Are you sure you want to delete ${e?fullName(e):'this employee'} and associated records?`))return;try{await api('/api/employees?id='+encodeURIComponent(id),{method:'DELETE'});toast('Employee deleted.','success');await load()}catch(e){toast(e.message,'error')}}
function joinAddress(e,prefix){return [e[prefix+'_address_line'],e[prefix+'_city'],e[prefix+'_state'],e[prefix+'_pincode']].filter(Boolean).join(', ')||'—';}

async function viewEmployee(id){
  const e=employees.find(x=>x.id===id);if(!e)return;
  currentProfileEmployeeId=e.employee_id;
  $('profileTitle').textContent=`${fullName(e)} · ${e.employee_id||''}`;
  const image=e.photo_url?`<img src="${escAttr(e.photo_url)}" class="w-28 h-32 object-cover rounded-xl border" alt="Photo">`:'<div class="w-28 h-32 rounded-xl border bg-slate-50 flex items-center justify-center text-slate-400 text-xs">No photo</div>';
  const sig=e.signature_url?`<img src="${escAttr(e.signature_url)}" class="w-56 h-24 object-contain rounded-xl border" alt="Signature">`:'<div class="w-56 h-24 rounded-xl border bg-slate-50 flex items-center justify-center text-slate-400 text-xs">No signature</div>';
  $('profileBody').innerHTML=`<div class="grid lg:grid-cols-[160px_1fr] gap-6 mb-6"><div>${image}</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${detail('Employee ID',e.employee_id)}${detail('Site Code',e.site_code)}${detail('Designation',e.designation)}${detail('Status',e.date_of_exit?'Exited':'Active')}${detail('Age',e.age)}${detail('Blood Group',e.blood_group)}${detail('Date of Joining',fmtDate(e.date_of_joining))}</div></div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${fields.filter(k=>!['employee_id','site_code','designation','date_of_joining','blood_group',...addressFields].includes(k)).map(k=>detail(exportLabels[k]||k.replaceAll('_',' '),k.startsWith('date_')?fmtDate(e[k]):e[k])).join('')}</div><div class="grid sm:grid-cols-2 gap-4 mt-4">${detail('Permanent Address',joinAddress(e,'permanent'))}${detail('Present Address',joinAddress(e,'present'))}</div><div class="mt-6"><div class="text-sm font-bold mb-2">Specimen Signature</div>${sig}</div>
    <div class="mt-8"><div class="flex items-center justify-between mb-2 no-print"><h4 class="font-bold">Joining Forms</h4><div class="flex gap-2"><input type="file" id="jfFileInput" accept="image/jpeg,image/png,image/webp,application/pdf" class="hiddenx" onchange="uploadDocFromInput(this,'joining_form')"><button onclick="document.getElementById('jfFileInput').click()" class="border rounded-lg px-3 py-1.5 text-xs font-semibold bg-white">⇧ Upload</button><button onclick="openCamera('document',{category:'joining_form'})" class="border rounded-lg px-3 py-1.5 text-xs font-semibold bg-white">📷 Camera</button></div></div><div id="jfList" class="grid sm:grid-cols-2 gap-2 text-sm"><p class="text-slate-400 text-sm">Loading…</p></div></div>
    <div class="mt-6"><div class="flex items-center justify-between mb-2 no-print"><h4 class="font-bold">F11 Forms</h4><div class="flex gap-2"><input type="file" id="f11FileInput" accept="image/jpeg,image/png,image/webp,application/pdf" class="hiddenx" onchange="uploadDocFromInput(this,'f11')"><button onclick="document.getElementById('f11FileInput').click()" class="border rounded-lg px-3 py-1.5 text-xs font-semibold bg-white">⇧ Upload</button><button onclick="openCamera('document',{category:'f11'})" class="border rounded-lg px-3 py-1.5 text-xs font-semibold bg-white">📷 Camera</button></div></div><div id="f11List" class="grid sm:grid-cols-2 gap-2 text-sm"><p class="text-slate-400 text-sm">Loading…</p></div></div>
    <div class="mt-6 flex gap-2 no-print"><button onclick="editEmployee('${e.id}');closeProfile()" class="bg-indigo-600 text-white px-4 py-2 rounded-xl">Edit</button><button onclick="window.print()" class="border px-4 py-2 rounded-xl bg-white">Print</button></div>`;
  $('profileModal').classList.remove('hiddenx');
  loadEmployeeDocuments(e.employee_id);
}
function detail(label,value){return `<div><div class="text-xs font-semibold uppercase text-slate-400">${esc(label)}</div><div class="mt-1 text-sm whitespace-pre-wrap break-words">${esc(value??'—')}</div></div>`}
function closeProfile(){$('profileModal').classList.add('hiddenx');currentProfileEmployeeId=null;}

async function loadEmployeeDocuments(employeeId){
  try{
    const d=await api('/api/documents?employeeId='+encodeURIComponent(employeeId));
    const docs=d.data||[];
    renderDocList('jfList', docs.filter(x=>x.category==='joining_form'));
    renderDocList('f11List', docs.filter(x=>x.category==='f11'));
  }catch(e){ if($('jfList'))$('jfList').innerHTML=`<p class="text-red-600 text-sm">${esc(e.message)}</p>`; }
}
function renderDocList(containerId, docs){
  const el=$(containerId); if(!el) return;
  el.innerHTML = docs.length ? docs.map(doc=>{
    const isImage=(doc.mime_type||'').startsWith('image/');
    const thumb=isImage?`<img src="${escAttr(doc.url)}" class="w-14 h-14 object-cover rounded-lg border" alt="">`:'<div class="w-14 h-14 rounded-lg border bg-slate-50 flex items-center justify-center text-xs text-slate-400">PDF</div>';
    return `<div class="border rounded-xl p-2 flex items-center gap-3">${thumb}<div class="flex-1 min-w-0"><div class="text-xs font-semibold truncate">${esc(doc.file_name||'Document')}</div><div class="text-xs text-slate-400">${fmtDate(doc.uploaded_at?.slice(0,10))}</div><div class="flex gap-2 mt-1 no-print"><a href="${escAttr(doc.url)}" target="_blank" rel="noopener" class="text-indigo-600 text-xs font-semibold">View</a><a href="${escAttr(doc.url)}" download="${escAttr(doc.file_name||'document')}" class="text-indigo-600 text-xs font-semibold">Download</a><button onclick="deleteDocument('${doc.id}')" class="text-red-600 text-xs font-semibold">Delete</button></div></div></div>`;
  }).join('') : '<p class="text-slate-400 text-sm">No files uploaded yet.</p>';
}
async function uploadDocFromInput(input, category){
  const f=input.files[0]; if(!f) return;
  if(f.size>10*1024*1024){toast('File must be 10 MB or smaller.','error');input.value='';return}
  try{ const data=await toDataUrl(f); await uploadDocument(category, data, f.name, f.type); }
  catch(e){ toast(e.message,'error'); }
  input.value='';
}
async function uploadDocument(category, dataUrl, fileName, mimeType){
  if(!currentProfileEmployeeId) return;
  toast('Uploading document...','info');
  await api('/api/documents',{method:'POST',body:JSON.stringify({employeeId:currentProfileEmployeeId,category,data:dataUrl,fileName,mimeType})});
  toast('Document uploaded.','success');
  await loadDocumentCounts(); await loadEmployeeDocuments(currentProfileEmployeeId); renderTable();
}
async function deleteDocument(id){
  if(!confirm('Delete this document?')) return;
  try{ await api('/api/documents?id='+encodeURIComponent(id),{method:'DELETE'}); toast('Document deleted.','success'); await loadDocumentCounts(); await loadEmployeeDocuments(currentProfileEmployeeId); renderTable(); }
  catch(e){ toast(e.message,'error'); }
}

// ---------------- Camera capture (Photo / Signature / Documents) ----------------
let cameraStream=null, cameraKind=null, cameraDocCtx=null;
let cameraPendingData={photo:null, signature:null};
async function openCamera(kind, docCtx){
  cameraKind=kind; cameraDocCtx=docCtx||null;
  $('cameraTitle').textContent = kind==='photo' ? 'Capture Employee Photo' : kind==='signature' ? 'Capture Signature' : `Capture ${docCtx.category==='joining_form'?'Joining Form':'F11 Form'} Page`;
  $('cameraError').textContent=''; $('cameraModal').classList.remove('hiddenx');
  $('cameraVideo').classList.remove('hiddenx'); $('cameraCanvas').classList.add('hiddenx');
  $('cameraCaptureBtn').classList.remove('hiddenx'); $('cameraRetakeBtn').classList.add('hiddenx'); $('cameraConfirmBtn').classList.add('hiddenx');
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    $('cameraVideo').srcObject=cameraStream;
  }catch(e){
    $('cameraError').textContent='Camera permission is required to capture a photo. Please allow camera access or use Upload instead.';
  }
}
function captureFrame(){
  const video=$('cameraVideo'), canvas=$('cameraCanvas');
  if(!video.videoWidth){ $('cameraError').textContent='Camera is still starting up, please wait a moment and try again.'; return; }
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  video.classList.add('hiddenx'); canvas.classList.remove('hiddenx');
  $('cameraCaptureBtn').classList.add('hiddenx'); $('cameraRetakeBtn').classList.remove('hiddenx'); $('cameraConfirmBtn').classList.remove('hiddenx');
}
function retakeFrame(){
  $('cameraVideo').classList.remove('hiddenx'); $('cameraCanvas').classList.add('hiddenx');
  $('cameraCaptureBtn').classList.remove('hiddenx'); $('cameraRetakeBtn').classList.add('hiddenx'); $('cameraConfirmBtn').classList.add('hiddenx');
}
async function confirmCapture(){
  const dataUrl=$('cameraCanvas').toDataURL('image/jpeg',0.92);
  if(cameraKind==='photo'){ cameraPendingData.photo=dataUrl; $('photoPreview').src=dataUrl; $('photoPreview').classList.remove('hiddenx'); $('photo').value=''; }
  else if(cameraKind==='signature'){ cameraPendingData.signature=dataUrl; $('signaturePreview').src=dataUrl; $('signaturePreview').classList.remove('hiddenx'); $('signature').value=''; }
  else if(cameraKind==='document'){ try{ await uploadDocument(cameraDocCtx.category, dataUrl, `camera-${Date.now()}.jpg`, 'image/jpeg'); }catch(e){ toast(e.message,'error'); } }
  closeCamera();
}
function closeCamera(){
  if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; }
  $('cameraModal').classList.add('hiddenx');
}

async function exportExcel(){try{toast('Preparing Excel...','info');const r=await fetch('/api/export',{credentials:'same-origin'});if(!r.ok){const d=await r.json();throw new Error(d.error||'Export failed')}const b=await r.blob();const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='employee-database-export.xlsx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Excel downloaded.','success')}catch(e){toast(e.message,'error')}}

async function importExcel(file){
  if(!file)return;
  if(!confirm('Import this Excel file? Existing Employee IDs will be updated (including their Photo/Signature if the file has new embedded images); new Employee IDs will be created.'))return;
  try{
    toast('Uploading and processing Excel...','info');
    const data=await toDataUrl(file);
    const result=await api('/api/import',{method:'POST',body:JSON.stringify({data})});
    await load();show('employees');
    toast(`Import complete · ${result.employeesImported} employees, ${result.photosImported} photos, ${result.signaturesImported} signatures${result.imageFailures?`, ${result.imageFailures} image failures`:''}`,'success');
  }catch(e){toast(e.message,'error')}
}

function fmtDate(v){if(!v)return '—';const d=new Date(v+'T00:00:00');return isNaN(d)?v:d.toLocaleDateString('en-GB')}
function toast(msg,type='info'){const t=$('toast');const cls=type==='error'?'bg-red-600':type==='success'?'bg-emerald-600':'bg-slate-900';t.innerHTML=`<div class="${cls} text-white px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm">${esc(msg)}</div>`;t.classList.remove('hiddenx');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.add('hiddenx'),3500)}
function esc(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function escAttr(v){return esc(v)}
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCamera();closeProfile();}});
boot();
