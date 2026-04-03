// ===== ADMIN CMS V2 — Server-side auth, full management =====
import { $ } from './state.js';
import { AP_CATS, AP_SUBJ, AP_CRS } from './constants.js';

let _apDocs=[],_apSearch='',_apSort='title',_apSortDir=1;
let _apFile=null;

function apToken(){return sessionStorage.getItem('adminToken')}
function apSetToken(t){if(t)sessionStorage.setItem('adminToken',t);else sessionStorage.removeItem('adminToken')}
async function apFetch(url,opts={}){
  const h=opts.headers||{};const t=apToken();
  if(t)h['Authorization']='Bearer '+t;
  if(!(opts.body instanceof FormData))h['Content-Type']='application/json';
  opts.headers=h;const r=await fetch(url,opts);return r.json();
}
function apToast(msg,type='success'){
  const w=$('apToasts');if(!w)return;
  const d=document.createElement('div');d.className='ap-toast '+type;d.textContent=msg;
  w.appendChild(d);setTimeout(()=>{d.style.opacity='0';d.style.transform='translateX(20px)';setTimeout(()=>d.remove(),300)},3000);
}

// Easter egg trigger
(function(){let cc=0,ct=0;const el=$('ftCopy');if(!el)return;el.style.cursor='default';
el.addEventListener('click',()=>{const now=Date.now();if(now-ct>2500)cc=0;ct=now;cc++;if(cc>=7){cc=0;openAdmin()}})})();

function openAdmin(){$('adminPanel').classList.add('open');document.body.style.overflow='hidden';renderAdmin()}
function closeAdmin(){$('adminPanel').classList.remove('open');document.body.style.overflow=''}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('adminPanel').classList.contains('open'))closeAdmin()});

function renderAdmin(){
  const t=apToken();
  if(!t){renderAdminLogin();return}
  apFetch('/api/admin/verify').then(r=>{if(r.ok)renderAdminShell();else{apSetToken(null);renderAdminLogin()}}).catch(()=>{apSetToken(null);renderAdminLogin()});
}
function renderAdminLogin(){
  $('adminContent').innerHTML='<div class="ap-login"><div class="ap-login-card"><button class="ap-close" onclick="closeAdmin()" style="position:absolute;top:12px;right:12px">&#10005;</button><h2>Панель управления</h2><p>Введите пароль администратора</p><input class="ap-input" id="apPwd" type="password" placeholder="Пароль" autocomplete="off"><button class="ap-btn-primary" id="apLoginBtn" onclick="doAdminLogin()">Войти</button><div class="ap-login-err" id="apLoginErr"></div></div></div>';
  setTimeout(()=>{const i=$('apPwd');if(i){i.focus();i.addEventListener('keydown',e=>{if(e.key==='Enter')doAdminLogin();if(e.key==='Escape')closeAdmin()})}},100);
}
async function doAdminLogin(){
  const pwd=$('apPwd').value.trim(),btn=$('apLoginBtn'),err=$('apLoginErr');
  if(!pwd){err.textContent='Введите пароль';return}
  btn.disabled=true;btn.textContent='Проверяю...';err.textContent='';
  try{const r=await apFetch('/api/admin/login',{method:'POST',body:JSON.stringify({password:pwd})});
    if(r.ok&&r.token){apSetToken(r.token);renderAdminShell()}
    else{err.textContent=r.error||'Неверный пароль';btn.disabled=false;btn.textContent='Войти'}
  }catch(e){err.textContent='Ошибка соединения';btn.disabled=false;btn.textContent='Войти'}
}
function renderAdminShell(){
  $('adminContent').innerHTML='<div class="ap-shell"><div class="ap-header"><span class="ap-logo">Личный кабинет</span><div class="ap-header-spacer"></div><button class="ap-btn-ghost" onclick="doAdminLogout()">Выйти</button><button class="ap-close" onclick="closeAdmin()">&#10005;</button></div><div class="ap-tabs"><button class="ap-tab on" data-tab="dashboard" onclick="apTab(\'dashboard\')">Дашборд</button><button class="ap-tab" data-tab="docs" onclick="apTab(\'docs\')">Документы</button><button class="ap-tab" data-tab="upload" onclick="apTab(\'upload\')">Загрузка</button><button class="ap-tab" data-tab="orders" onclick="apTab(\'orders\')">Заявки</button><button class="ap-tab" data-tab="export" onclick="apTab(\'export\')">Экспорт</button></div><div class="ap-content" id="apC"></div></div>';
  apTab('dashboard');
}
function apTab(t){
  document.querySelectorAll('.ap-tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  if(t==='dashboard')apDashboard();else if(t==='docs')apDocs();else if(t==='upload')apUpload();else if(t==='orders')apOrders();else if(t==='export')apExport();
}
async function doAdminLogout(){await apFetch('/api/admin/logout',{method:'POST'}).catch(()=>{});apSetToken(null);renderAdminLogin()}

// === Dashboard ===
async function apDashboard(){
  const c=$('apC');c.innerHTML='<div style="color:var(--t3)">Загрузка...</div>';
  try{const r=await apFetch('/api/admin/analytics');if(!r.ok){c.innerHTML='<div style="color:#f87171">Ошибка</div>';return}
  let h='<div class="ap-stats"><div class="ap-stat"><div class="ap-stat-val">'+r.totalDocs+'</div><div class="ap-stat-label">Документов</div></div><div class="ap-stat"><div class="ap-stat-val">'+r.totalViews+'</div><div class="ap-stat-label">Просмотров</div></div><div class="ap-stat"><div class="ap-stat-val">'+r.totalDownloads+'</div><div class="ap-stat-label">Скачиваний</div></div><div class="ap-stat"><div class="ap-stat-val">'+r.totalLikes+'</div><div class="ap-stat-label">Лайков</div></div></div>';
  if(r.topViewed&&r.topViewed.length){h+='<div class="ap-section"><div class="ap-section-title">Топ по просмотрам</div>';
    r.topViewed.slice(0,10).forEach((d,i)=>{const nm=d.file.replace('files/','').replace(/\.[^.]+$/,'');h+='<div class="ap-top-item"><span class="ap-top-rank">'+(i+1)+'</span><span class="ap-top-name">'+nm+'</span><span class="ap-top-val">'+d.views+'</span></div>'});h+='</div>'}
  if(r.topDownloaded&&r.topDownloaded.filter(d=>d.downloads>0).length){h+='<div class="ap-section"><div class="ap-section-title">Топ по скачиваниям</div>';
    r.topDownloaded.filter(d=>d.downloads>0).slice(0,10).forEach((d,i)=>{const nm=d.file.replace('files/','').replace(/\.[^.]+$/,'');h+='<div class="ap-top-item"><span class="ap-top-rank">'+(i+1)+'</span><span class="ap-top-name">'+nm+'</span><span class="ap-top-val">'+d.downloads+'</span></div>'});h+='</div>'}
  c.innerHTML=h}catch(e){c.innerHTML='<div style="color:#f87171">'+e.message+'</div>'}
}

// === Documents ===
async function apDocs(){
  const c=$('apC');c.innerHTML='<div style="color:var(--t3)">Загрузка каталога...</div>';
  try{const r=await apFetch('/api/admin/docs');if(!r.ok){c.innerHTML='<div style="color:#f87171">Ошибка</div>';return}
  _apDocs=r.docs;apDocTable()}catch(e){c.innerHTML='<div style="color:#f87171">'+e.message+'</div>'}
}
function apDocTable(){
  const c=$('apC');const q=_apSearch.toLowerCase();
  let filtered=q?_apDocs.filter(d=>(d.title||'').toLowerCase().includes(q)||(d.category||'').toLowerCase().includes(q)||(d.subject||'').toLowerCase().includes(q)):_apDocs.slice();
  filtered.sort((a,b)=>{const va=(a[_apSort]||'').toLowerCase(),vb=(b[_apSort]||'').toLowerCase();return va<vb?-_apSortDir:va>vb?_apSortDir:0});
  const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  let h='<div class="ap-search"><input class="ap-input" placeholder="Поиск..." value="'+esc(_apSearch)+'" oninput="_apSearch=this.value;apDocTable()"></div>';
  h+='<div class="ap-doc-count">'+filtered.length+' из '+_apDocs.length+' документов</div>';
  h+='<div style="overflow-x:auto"><table class="ap-tbl"><thead><tr>';
  h+='<th onclick="apSort(\'title\')">Название</th><th onclick="apSort(\'category\')">Категория</th><th onclick="apSort(\'subject\')">Предмет</th><th onclick="apSort(\'course\')">Курс</th><th>Размер</th><th></th>';
  h+='</tr></thead><tbody>';
  filtered.forEach((d,i)=>{
    const idx=_apDocs.indexOf(d);
    h+='<tr><td class="ap-td-title" onclick="apToggle('+idx+')">'+esc(d.title||d.filename)+'</td><td>'+esc(d.category)+'</td><td>'+esc(d.subject)+'</td><td>'+(d.course||'—')+'</td><td style="font-family:var(--fm);font-size:11px;white-space:nowrap">'+d.size+'</td><td><div class="ap-actions"><button class="ap-btn-del" onclick="apDel('+idx+')">&#10005;</button></div></td></tr>';
    h+='<tr class="ap-edit-row" id="apE'+idx+'"><td colspan="6"><div class="ap-edit-grid">';
    h+='<div><div class="ap-edit-label">Название</div><input class="ap-edit-input" id="apT'+idx+'" value="'+esc(d.title||d.filename)+'"></div>';
    h+='<div><div class="ap-edit-label">Тип</div><input class="ap-edit-input" id="apDT'+idx+'" value="'+esc(d.docType||'')+'"></div>';
    h+='<div><div class="ap-edit-label">Категория</div><select class="ap-edit-select" id="apCt'+idx+'">'+AP_CATS.map(c=>'<option'+(c===d.category?' selected':'')+'>'+c+'</option>').join('')+'</select></div>';
    h+='<div><div class="ap-edit-label">Предмет</div><select class="ap-edit-select" id="apSb'+idx+'">'+AP_SUBJ.map(s=>'<option'+(s===d.subject?' selected':'')+'>'+s+'</option>').join('')+'</select></div>';
    h+='<div><div class="ap-edit-label">Курс</div><select class="ap-edit-select" id="apCr'+idx+'">'+AP_CRS.map(k=>'<option value="'+k+'"'+(k===d.course?' selected':'')+'>'+(k||'Не указан')+'</option>').join('')+'</select></div>';
    h+='</div><div style="margin-top:10px"><div class="ap-edit-label">Описание</div><textarea class="ap-edit-textarea" id="apDs'+idx+'">'+esc(d.description||'')+'</textarea></div>';
    h+='<div class="ap-actions" style="margin-top:10px"><button class="ap-btn-save" onclick="apSave('+idx+')">Сохранить</button></div></td></tr>';
  });
  h+='</tbody></table></div>';c.innerHTML=h;
}
function apSort(col){if(_apSort===col)_apSortDir*=-1;else{_apSort=col;_apSortDir=1}apDocTable()}
function apToggle(i){const r=$('apE'+i);if(r)r.classList.toggle('open')}
async function apSave(i){
  const d=_apDocs[i];if(!d)return;
  const u={title:$('apT'+i).value.trim(),description:$('apDs'+i).value.trim(),category:$('apCt'+i).value,subject:$('apSb'+i).value,course:$('apCr'+i).value,docType:$('apDT'+i).value.trim(),catalogTitle:$('apT'+i).value.trim(),catalogDescription:$('apDs'+i).value.trim()};
  try{const r=await apFetch('/api/admin/docs',{method:'PUT',body:JSON.stringify({file:d.file,updates:u})});
    if(r.ok){Object.assign(_apDocs[i],u);apToast('Сохранено');apDocTable()}else apToast(r.error||'Ошибка','error')}catch(e){apToast('Ошибка сети','error')}
}
function apDel(i){
  const d=_apDocs[i];if(!d)return;
  const ov=document.createElement('div');ov.className='ap-confirm';
  ov.innerHTML='<div class="ap-confirm-box"><h3>Удалить?</h3><p>'+((d.title||d.filename).substring(0,60))+'</p><div class="ap-confirm-btns"><button class="ap-btn-ghost" onclick="this.closest(\'.ap-confirm\').remove()">Отмена</button><button class="ap-btn-del" style="padding:10px 20px" onclick="apDoDelete('+i+');this.closest(\'.ap-confirm\').remove()">Удалить</button></div></div>';
  document.body.appendChild(ov);
}
async function apDoDelete(i){
  const d=_apDocs[i];if(!d)return;
  try{const r=await apFetch('/api/admin/docs',{method:'DELETE',body:JSON.stringify({file:d.file})});
    if(r.ok){_apDocs.splice(i,1);apToast('Удалено');apDocTable()}else apToast(r.error||'Ошибка','error')}catch(e){apToast('Ошибка сети','error')}
}

// === Upload ===
function apUpload(){
  const c=$('apC');
  c.innerHTML='<div class="ap-drop" id="apDrop" onclick="$(\'apFI\').click()"><div class="ap-drop-icon">&#128196;</div><div class="ap-drop-text">Перетащите файл или нажмите для выбора</div><div class="ap-drop-hint">DOCX, PDF, DOC — до 50 МБ</div></div><input type="file" id="apFI" style="display:none" accept=".docx,.doc,.pdf,.xlsx,.pptx,.odt,.txt" onchange="apFileSel(this.files[0])"><div class="ap-file-info" id="apFInfo"><span id="apFName"></span></div><div class="ap-form-grid"><div class="ap-form-group full"><div class="ap-form-label">Название</div><input class="ap-input" id="apUpT" placeholder="Название документа"></div><div class="ap-form-group full"><div class="ap-form-label">Описание</div><textarea class="ap-edit-textarea" id="apUpD" placeholder="Краткое описание" style="min-height:60px"></textarea></div><div class="ap-form-group"><div class="ap-form-label">Категория</div><select class="ap-edit-select" id="apUpCat">'+AP_CATS.map(c=>'<option>'+c+'</option>').join('')+'</select></div><div class="ap-form-group"><div class="ap-form-label">Предмет</div><select class="ap-edit-select" id="apUpSub">'+AP_SUBJ.map(s=>'<option>'+s+'</option>').join('')+'</select></div><div class="ap-form-group"><div class="ap-form-label">Курс</div><select class="ap-edit-select" id="apUpCrs">'+AP_CRS.map(k=>'<option value="'+k+'">'+(k||'Не указан')+'</option>').join('')+'</select></div><div class="ap-form-group"><div class="ap-form-label">Тип документа</div><input class="ap-input" id="apUpDT" placeholder="Реферат, курсовая..."></div></div><button class="ap-btn-primary" id="apUpBtn" onclick="apDoUpload()" disabled>Загрузить документ</button><div class="ap-progress" id="apProg"><div class="ap-progress-bar" id="apProgBar"></div></div>';
  const drop=$('apDrop');if(drop){
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag')});
    drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));
    drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');if(e.dataTransfer.files.length)apFileSel(e.dataTransfer.files[0])});
  }
}
function apFileSel(f){if(!f)return;_apFile=f;$('apFName').textContent=f.name+' ('+(f.size/1024).toFixed(1)+' KB)';$('apFInfo').classList.add('vis');$('apUpBtn').disabled=false;if(!$('apUpT').value)$('apUpT').value=f.name.replace(/\.[^.]+$/,'')}
async function apDoUpload(){
  if(!_apFile)return;const btn=$('apUpBtn'),prog=$('apProg'),bar=$('apProgBar');
  btn.disabled=true;btn.textContent='Загружаю...';prog.classList.add('vis');bar.style.width='0%';
  const fd=new FormData();fd.append('file',_apFile);fd.append('title',$('apUpT').value.trim());fd.append('description',$('apUpD').value.trim());fd.append('category',$('apUpCat').value);fd.append('subject',$('apUpSub').value);fd.append('course',$('apUpCrs').value);fd.append('docType',$('apUpDT').value.trim());
  const xhr=new XMLHttpRequest();xhr.open('POST','/api/admin/upload');xhr.setRequestHeader('Authorization','Bearer '+apToken());
  xhr.upload.onprogress=e=>{if(e.lengthComputable)bar.style.width=Math.round(e.loaded/e.total*100)+'%'};
  xhr.onload=()=>{try{const r=JSON.parse(xhr.responseText);if(r.ok){apToast('Документ загружен!');_apFile=null;apUpload()}else{apToast(r.error||'Ошибка','error');btn.disabled=false;btn.textContent='Загрузить документ'}}catch(e){apToast('Ошибка ответа','error');btn.disabled=false;btn.textContent='Загрузить документ'}};
  xhr.onerror=()=>{apToast('Ошибка сети','error');btn.disabled=false;btn.textContent='Загрузить документ'};
  xhr.send(fd);
}

// === Export ===
function apExport(){
  const c=$('apC');
  c.innerHTML='<div class="ap-export-grid"><div class="ap-export-card" onclick="apDlJSON()"><h4>Каталог JSON</h4><p>Скачать catalog.json</p></div><div class="ap-export-card" onclick="apDlCSV()"><h4>Каталог CSV</h4><p>Скачать таблицу Excel/Google Sheets</p></div></div><div class="ap-section" style="margin-top:24px"><div class="ap-section-title">Статистика каталога</div><div id="apExpStats"></div></div>';
  apFetch('/api/admin/docs').then(r=>{if(!r.ok)return;const cats={};r.docs.forEach(d=>{cats[d.category]=(cats[d.category]||0)+1});
    let h='';Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>{h+='<div class="ap-top-item"><span class="ap-top-name">'+c+'</span><span class="ap-top-val">'+n+'</span></div>'});
    $('apExpStats').innerHTML=h}).catch(()=>{});
}
// === Orders ===
async function apOrders(){
  var c=$('apC');c.innerHTML='<div style="color:var(--t3)">Загрузка заявок...</div>';
  try{var r=await apFetch('/api/admin/orders');if(!r.ok){c.innerHTML='<div style="color:#f87171">Ошибка</div>';return}
  if(!r.orders||!r.orders.length){c.innerHTML='<div class="ap-section"><div class="ap-section-title">Заявки</div><p style="color:var(--t3);font-size:13px">Пока нет заявок</p></div>';return}
  var h='<div class="ap-section"><div class="ap-section-title">Заявки ('+r.orders.length+')</div>';
  r.orders.forEach(function(o){
    var date=o.created_at?new Date(o.created_at*1000).toLocaleString('ru-RU'):'';
    var status=o.status==='new'?'🟡 Новая':'✅ '+o.status;
    h+='<div style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,.03)">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><strong style="color:var(--t1);font-size:14px">'+(o.topic||'Без темы')+'</strong><span style="font-size:11px;color:var(--t3)">'+date+'</span></div>';
    if(o.work_type)h+='<div style="font-size:12px;color:var(--t2);margin-bottom:3px">Тип: '+o.work_type+'</div>';
    if(o.deadline)h+='<div style="font-size:12px;color:var(--t2);margin-bottom:3px">Срок: '+o.deadline+'</div>';
    h+='<div style="font-size:13px;color:var(--ac2);font-weight:600">Контакт: '+o.contact+'</div>';
    if(o.comment)h+='<div style="font-size:12px;color:var(--t3);margin-top:4px;font-style:italic">'+o.comment+'</div>';
    h+='<div style="font-size:11px;margin-top:4px">'+status+'</div>';
    h+='</div>';
  });
  h+='</div>';c.innerHTML=h}catch(e){c.innerHTML='<div style="color:#f87171">'+e.message+'</div>'}
}
function apDlJSON(){window.open('/catalog.json','_blank')}
function apDlCSV(){
  apFetch('/api/admin/docs').then(r=>{if(!r.ok)return;
    let csv='Название,Категория,Предмет,Курс,Тип,Размер,Файл\n';
    r.docs.forEach(d=>{csv+=[d.title,d.category,d.subject,d.course,d.docType,d.size,d.file].map(v=>'"'+(v||'').replace(/"/g,'""')+'"').join(',')+'\n'});
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='catalog.csv';a.click();
    apToast('CSV скачан')}).catch(()=>apToast('Ошибка','error'));
}

export {
  openAdmin, closeAdmin, apTab, apSort, apToggle, apDel, apSave,
  apDoDelete, apDoUpload, apFileSel, apDlJSON, apDlCSV,
  doAdminLogin, doAdminLogout,
};
