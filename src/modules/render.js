/**
 * Rendering — document cards, modal, catalog grid, sharing, bookmarks
 */
import { D } from '../data/catalog-data.js';
import { S, $, saveBookmarks } from './state.js';
import { DOC_DISCLAIMER_SHORT, DOC_DISCLAIMER_FULL, STATS_ICONS, PAGE_SIZE, CTA_VARIANTS } from './constants.js';
import { escAttr, pluralize, gExt, hl, gDesc, gTitle, estPages, getCatPrice, hardenExternalLinks, isCompactMobile } from './utils.js';
import { buildDownloadHref, refreshStatsUI, queueStats, recordStatEvent } from './stats.js';
import { syncSearchInputs, showGentleToast, syncCustomSelects, syncMobileToolbarButtons } from './ui.js';
import { submitQuickOrder, openOrderForm } from './order.js';
import { getF } from './search.js';

let fD = [];
export let showCount = PAGE_SIZE;
export function setShowCount(n) { showCount = n; }

// DOM element references
const grid = $('cds');
const emp = $('emp');
const ri = $('ri');
const chips = $('chips');


const tb = $('tb');

/** Generate skeleton loading HTML */
export function renderSkeletons(count = 6) {
  let h = '';
  for (let i = 0; i < count; i++) {
    h += '<div class="skeleton-card">'
      + '<div class="sk-row"><div class="sk-circle"></div><div class="sk-lines"><div class="sk-line"></div><div class="sk-line"></div></div></div>'
      + '<div class="sk-lines"><div class="sk-line"></div><div class="sk-line"></div><div class="sk-line"></div></div>'
      + '<div class="sk-tags"><div class="sk-tag"></div><div class="sk-tag"></div><div class="sk-tag"></div></div>'
      + '</div>';
  }
  return h;
}

function renderDocDisclaimerMini(){return '<div class="ref-pill">'+DOC_DISCLAIMER_SHORT+'</div>'}
export function renderDocDisclaimerFull(){return '<div class="mdl-legal"><div class="mdl-legal-title">Важно: использование на ваш риск</div><div class="mdl-legal-text">'+DOC_DISCLAIMER_FULL+'</div></div>'}
export function buildOrderHelpUrl(){
  const parts=[];
  if(S.q)parts.push('Тема: '+S.q);
  if(S.subj)parts.push('Предмет: '+S.subj);
  if(S.cat&&S.cat!=='bookmarks')parts.push('Тип: '+S.cat);
  if(S.crs)parts.push('Курс: '+S.crs);
  const text=parts.length
    ?'Здравствуйте. Не нашёл работу в каталоге. Нужна помощь по запросу. '+parts.join(' · ')
    :'Здравствуйте. Не нашёл работу в каталоге. Нужна помощь с подбором или написанием материала.';
  return 'https://vk.com/im?sel=-182261774&msg='+encodeURIComponent(text);
}
export function renderEmptyState(){
  const topic=S.q||'';const subj=S.subj||'';
  return '<div class="emp-card">'
    +'<div class="emp-i">&#128270;</div>'
    +'<div class="emp-t">Не нашли нужную работу'+(topic?' по запросу &laquo;'+escAttr(topic)+'&raquo;':'')+'?</div>'
    +'<div class="emp-d">Не беда! Мы можем сделать индивидуально под ваши требования. Оставьте заявку &mdash; мы рассчитаем стоимость и сроки.</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;max-width:480px">'
      +'<input class="ap-input" id="empTopic" placeholder="Тема работы" value="'+escAttr(topic)+'">'
      +'<input class="ap-input" id="empContact" placeholder="ВК или Telegram для связи">'
    +'</div>'
    +'<div class="emp-actions">'
      +'<button class="emp-btn-main" type="button" onclick="submitQuickOrder()">Отправить заявку</button>'
      +'<button class="emp-btn-soft" type="button" onclick="resetFilters()">Сбросить фильтры</button>'
    +'</div>'
    +'<div class="emp-note" style="margin-top:12px;opacity:.5">Бесплатная консультация. Без обязательств. Обычно отвечаем за 15 минут.</div>'
  +'</div>';
}
export function renderInlineStats(file){
  const safeFile=escAttr(file);
  return '<div class="sig-row" data-stat-file="'+safeFile+'">'
    +'<span class="sig-pill" title="Просмотры">'+STATS_ICONS.eye+'<b data-stat-count="views">0</b></span>'
    +'<span class="sig-pill" title="Скачивания">'+STATS_ICONS.download+'<b data-stat-count="downloads">0</b></span>'
    +'<button type="button" class="sig-btn is-up" data-reaction-btn="1" aria-pressed="false" title="Лайк">'+STATS_ICONS.like+'<b data-stat-count="likes">0</b></button>'
    +'<button type="button" class="sig-btn is-down" data-reaction-btn="-1" aria-pressed="false" title="Дизлайк">'+STATS_ICONS.dislike+'<b data-stat-count="dislikes">0</b></button>'
    +'</div>';
}
export function renderModalStats(file){
  const safeFile=escAttr(file);
  return '<div class="mdl-stats" data-stat-file="'+safeFile+'">'
    +'<div class="mdl-stat"><div class="mdl-stat-head">'+STATS_ICONS.eye+'<span>Просмотров</span></div><div class="mdl-stat-val" data-stat-count="views">0</div></div>'
    +'<div class="mdl-stat"><div class="mdl-stat-head">'+STATS_ICONS.download+'<span>Скачиваний</span></div><div class="mdl-stat-val" data-stat-count="downloads">0</div></div>'
    +'<button type="button" class="mdl-stat mdl-stat-btn is-up" data-reaction-btn="1" aria-pressed="false"><div class="mdl-stat-head">'+STATS_ICONS.like+'<span>Лайк</span></div><div class="mdl-stat-val" data-stat-count="likes">0</div></button>'
    +'<button type="button" class="mdl-stat mdl-stat-btn is-down" data-reaction-btn="-1" aria-pressed="false"><div class="mdl-stat-head">'+STATS_ICONS.dislike+'<span>Дизлайк</span></div><div class="mdl-stat-val" data-stat-count="dislikes">0</div></button>'
    +'</div>';
}

export function rCard(d,i){
  const ext=gExt(d.filename),desc=gDesc(d),bk=S.bk.has(d.file),isL=S.view==='list',isM=isCompactMobile();
  const title=S.q?hl(gTitle(d),S.q):gTitle(d);
  const pg=estPages(d.size);
  const summary=[d.docType&&d.docType!==d.category?d.docType:'',d.subject&&d.subject!=='Общее'?d.subject:'',d.course].filter(Boolean).join(' · ');
  const _cc=(d.category||'').toLowerCase();
  const _ccat=_cc.includes('вкр')||_cc.includes('диплом')?'vkr':_cc.includes('курсов')?'kurs':_cc.includes('реферат')?'ref':_cc.includes('контрол')||_cc.includes('самост')?'kontr':'';
  const safeFile=d.file.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const downloadHref=buildDownloadHref(d.file);
  const bookmarkBtn='<button class="bk'+(bk?' sv':'')+'" onclick="event.stopPropagation();tBk(\''+safeFile+'\','+i+')" title="'+(bk?'Убрать из избранного':'В избранное')+'">'+(bk?'★':'☆')+'</button>';
  const acts=`<div class="cd-acts"><button class="bk${bk?' sv':''}" onclick="event.stopPropagation();tBk('${safeFile}',${i})" title="${bk?'Убрать из избранного':'В избранное'}">${bk?'★':'☆'}</button><a class="cd-dl" href="${buildDownloadHref(d.file)}" data-dl-file="${escAttr(d.file)}" download onclick="event.stopPropagation()" title="Скачать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a></div>`;
  if(isM&&!isL){
    let h='<div class="cd cdm" onclick="oM('+i+')" data-i="'+i+'">';
    h+='<div class="cdm-top"><div class="fi fi-'+ext+'">'+ext.toUpperCase()+'</div><div class="cdm-copy"><div class="cn">'+title+'</div>';
    if(summary)h+='<div class="cdm-sub">'+summary+'</div>';
    h+='</div>'+bookmarkBtn+'</div>';
    if(desc){const dh=S.q?hl(desc.slice(0,138),S.q):desc.slice(0,138);h+='<div class="cdesc cdm-desc">'+dh+(desc.length>138?'...':'')+'</div>'}
    h+='<div class="cdm-tags"><span class="mt mc" data-ccat="'+_ccat+'">'+d.category+'</span>';
    if(d.subject&&d.subject!=='Общее')h+='<span class="mt ms">'+d.subject+'</span>';
    if(d.course)h+='<span class="mt mk">'+d.course+'</span>';
    h+='</div>';
    h+='<div class="cdm-meta"><div class="cdm-size">';
    if(pg>0)h+='<span class="mz mp">~'+pg+' стр.</span>';
    h+='<span class="mz">'+d.size+'</span></div>'+renderInlineStats(d.file)+'</div>';
    h+='<div class="cdm-actions"><button type="button" class="cdm-open" onclick="event.stopPropagation();oM('+i+')">Открыть</button><a class="cdm-download" href="'+downloadHref+'" data-dl-file="'+escAttr(d.file)+'" download onclick="event.stopPropagation()">Скачать</a></div>';
    h+='</div>';return h;
  }
  if(isM&&isL){
    let h='<div class="cd cdm cdm-list" onclick="oM('+i+')" data-i="'+i+'">';
    h+='<div class="cdm-top"><div class="fi fi-'+ext+'">'+ext.toUpperCase()+'</div><div class="cdm-copy"><div class="cn">'+title+'</div>';
    h+='<div class="cdm-sub">'+[summary,d.size].filter(Boolean).join(' · ')+'</div></div>'+bookmarkBtn+'</div>';
    h+='<div class="cdm-list-row"><span class="mt mc" data-ccat="'+_ccat+'">'+d.category+'</span><a class="cdm-download" href="'+downloadHref+'" data-dl-file="'+escAttr(d.file)+'" download onclick="event.stopPropagation()">Скачать</a></div>';
    h+='</div>';return h;
  }
  let h='<div class="cd'+(isL?' lm':'')+'" onclick="oM('+i+')" data-i="'+i+'">';
  h+='<div class="ct"><div class="fi fi-'+ext+'">'+ext.toUpperCase()+'</div><div class="ci"><div class="cn">'+title+'</div>';
  if(!isL&&desc){const dh=S.q?hl(desc.slice(0,130),S.q):desc.slice(0,130);h+='<div class="cdesc">'+dh+(desc.length>130?'...':'')+'</div>'}
  if(isL)h+=renderInlineStats(d.file)+renderDocDisclaimerMini();
  h+='</div>';
  if(!isL){
    h+=acts;
  }
  h+='</div>';
  if(!isL){
    h+='<div class="cm"><div class="cm-tags"><span class="mt mc" data-ccat="'+_ccat+'">'+d.category+'</span>';
    if(d.subject&&d.subject!=='Общее')h+='<span class="mt ms">'+d.subject+'</span>';
    if(d.course)h+='<span class="mt mk">'+d.course+'</span>';
    h+='</div><div class="cm-meta"><div class="cm-meta-left">'+renderDocDisclaimerMini()+'</div><div class="cm-aux">';
    if(pg>0)h+='<span class="mz mp">~'+pg+' стр.</span>';
    h+='<span class="mz">'+d.size+'</span>'+renderInlineStats(d.file)+'</div></div></div>';
  }else{h+='<div class="lm-end"><span class="mz">'+d.size+'</span>'+acts+'</div>'}
  h+='</div>';return h;
}

export function showMoreDocs(){showCount+=PAGE_SIZE;render()}
export function render(){
  fD=getF();const n=fD.length;
  ri.textContent=n+' '+pluralize(n,'документ','документа','документов');
  grid.className='cds'+(S.view==='list'?' lv':'');
  syncMobileToolbarButtons();
  if(n===0){
    if(S.cat==='bookmarks'){
      grid.innerHTML='<div class="bk-empty"><div class="bk-empty-ico">&#11088;</div><div class="bk-empty-t">Нет сохранённых работ</div><div class="bk-empty-d">Нажмите &#9734; на карточке, чтобы добавить в избранное</div></div>';
      emp.style.display='none';
    } else {grid.innerHTML='';emp.innerHTML=renderEmptyState();hardenExternalLinks(emp);emp.style.display='block'};$('loadMoreWrap')&&($('loadMoreWrap').style.display='none')}
  else{
    emp.style.display='none';
    const ctaStep=isCompactMobile()?10:8;
    const limit=Math.min(showCount,n);
    let html='',ctaIdx=0;
    for(let i=0;i<limit;i++){const d=fD[i];
      html+=rCard(d,i);
      // Insert CTA less aggressively on mobile so the feed feels cleaner.
      if((i+1)%ctaStep===0 && ctaIdx<CTA_VARIANTS.length){
        const v=CTA_VARIANTS[ctaIdx%CTA_VARIANTS.length];
        html+='<div class="cta-card'+(v.alt?' cta-alt':'')+'" onclick="document.getElementById(\'orderSection\').scrollIntoView({behavior:\'smooth\'})">';
        html+='<div class="cta-glow"></div>';
        html+='<div class="cta-ico">'+v.ico+'</div>';
        html+='<div class="cta-t">'+v.t+'</div>';
        html+='<div class="cta-d">'+v.d+'</div>';
        html+='<div class="cta-btn">'+v.btn+'</div>';
        html+='</div>';
        ctaIdx++;
      }
    }
    grid.innerHTML=html;
    // Load More button
    const lmw=$('loadMoreWrap');
    if(lmw){
      if(limit<n){
        const rem=n-limit;
        const nextBatch=Math.min(PAGE_SIZE,rem);
        lmw.style.display='block';
        $('loadMoreBtn').textContent=nextBatch<rem
          ?'Показать ещё '+nextBatch+' из '+rem+' '+pluralize(rem,'документ','документа','документов')
          :'Показать ещё '+rem+' '+pluralize(rem,'документ','документа','документов');
      } else { lmw.style.display='none'; }
    }
  }
  const c=[];
  const chip=(type,value,key,cls)=>'<span class="chip'+(cls?' '+cls:'')+'"><span class="chip-k">'+type+'</span><span class="chip-v">'+value+'</span><button class="cx" onclick="clr(\''+key+'\')" aria-label="Убрать фильтр">&#10005;</button></span>';
  if(S.cat&&S.cat!=='bookmarks')c.push(chip('Раздел',S.cat,'cat'));
  if(S.cat==='bookmarks')c.push(chip('Раздел','Избранное','cat'));
  if(S.subj)c.push(chip('Предмет',S.subj,'subj'));
  if(S.crs)c.push(chip('Курс',S.crs,'crs'));
  if(S.q)c.push(chip('Поиск','«'+S.q+'»','q','is-query'));
  chips.innerHTML=c.length?'<span class="chips-head">Активные фильтры</span>'+c.join('')+'<button class="chips-reset" onclick="resetFilters()">Сбросить всё</button>':'';
}

export function oM(idx){openDoc(fD[idx])}
export function oMF(file){openDoc(D.find(doc=>doc.file===file&&doc.exists!==false))}
export function openDoc(d){
  if(!d)return;
  const ext=gExt(d.filename),desc=gDesc(d),title=gTitle(d),safeFile=d.file.replace(/'/g,"\\'"),safeTitle=title.replace(/'/g,"\\'");
  addRec(d);
  const cp=getCatPrice(d.category);
  let h='<div class="mdl-head" style="display:flex;align-items:center;gap:14px;margin-bottom:20px">';
  h+='<div class="fi fi-'+ext+' mdl-head-fi" style="width:56px;height:56px;font-size:15px">'+ext.toUpperCase()+'</div>';
  h+='<div class="mdl-head-copy"><div class="mdl-t">'+title+'</div>';
  const mpg=estPages(d.size);
  h+='<div class="mdl-head-meta" style="font-size:13px;color:var(--t3)">'+d.size+(mpg>0?' &middot; ~'+mpg+' стр.':'')+'</div>';
  h+='</div></div></div>';
  h+='<div class="mdl-m"><span class="mt mc">'+d.category+'</span>';
  if(d.docType&&d.docType!==d.category)h+='<span class="mt" style="background:rgba(212,175,55,.08);border-color:rgba(212,175,55,.14);color:var(--ac2)">'+d.docType+'</span>';
  if(d.subject&&d.subject!=='Общее')h+='<span class="mt ms">'+d.subject+'</span>';
  if(d.course)h+='<span class="mt mk">'+d.course+'</span>';
  h+='</div>';
  if(desc)h+='<div class="mdl-d">'+desc+'</div>';
  h+=renderModalStats(d.file);
  // Document preview panel
  h+='<div class="preview-panel">';
  h+='<button class="preview-toggle" id="previewToggle" onclick="event.stopPropagation();window._togglePreview(\''+escAttr(d.file)+'\',\''+escAttr(d.filename)+'\')">';
  h+='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  h+=' Предпросмотр</button>';
  h+='<div class="preview-content" id="previewContent"></div>';
  h+='</div>';
  h+='<div class="mdl-a mdl-a-main"><a class="mdl-dl" href="'+buildDownloadHref(d.file)+'" data-dl-file="'+escAttr(d.file)+'" download>';
  h+='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  h+=' Скачать</a>';
  h+='<button class="mdl-bk'+(S.bk.has(d.file)?' sv':'')+'" onclick="tBk(\''+safeFile+'\');render();oMF(\''+safeFile+'\')">';
  h+=(S.bk.has(d.file)?'&#9733; Избранное':'&#9734; Избранное')+'</button>';
  h+='</div>';
  if(canNativeShare()){
    h+='<div class="mdl-a mdl-a-share is-native" style="margin-top:8px">';
    h+='<button class="mdl-share mdl-share-native" onclick="event.stopPropagation();shareDoc(\''+safeFile+'\',\''+safeTitle+'\')" title="Поделиться ссылкой">&#128257; Поделиться</button></div>';
  }else{
    h+='<div class="mdl-a mdl-a-share" style="margin-top:8px">';
    h+='<span class="mdl-share-label" style="font-size:11px;color:var(--t3);margin-right:2px">Поделиться:</span>';
    h+='<button class="mdl-share" onclick="event.stopPropagation();shareVK(\''+safeFile+'\',\''+safeTitle+'\')">VK</button>';
    h+='<button class="mdl-share" onclick="event.stopPropagation();shareTG(\''+safeFile+'\',\''+safeTitle+'\')">TG</button>';
    h+='<button class="mdl-share mdl-share-copy" onclick="event.stopPropagation();copyLink(\''+safeFile+'\')" title="Скопировать ссылку">&#128279; Ссылка</button></div>';
  }
  h+=renderDocDisclaimerFull();
  // CONTEXTUAL upsell — price matches what user is viewing
  h+='<div class="modal-upsell"><div class="modal-upsell-ico">'+cp.emoji+'</div>';
  h+='<div><div class="modal-upsell-t">Нужна похожая '+cp.type.toLowerCase()+'?</div>';
  h+='<div class="modal-upsell-d">'+cp.price+'&#8381; &middot; 93% сдают с первого раза &middot; безлимитные правки</div></div>';
  h+='<button class="modal-upsell-btn" onclick="cM();setTimeout(function(){openOrderForm(\''+safeTitle+'\',\''+cp.type.replace(/'/g,"\\'")+'\')},300)" style="border:none;cursor:pointer">Заказать</button></div>';
  // Related documents — same category/subject
  const related=D.filter(r=>r.file!==d.file&&r.exists!==false&&(r.category===d.category||r.subject===d.subject))
    .sort(()=>Math.random()-.5).slice(0,3);
  if(related.length){
    h+='<div class="mdl-rel"><div class="mdl-rel-h">Похожие работы</div><div class="mdl-rel-list">';
    related.forEach((r,ri)=>{
      const re=gExt(r.filename);
      h+='<div class="mdl-rel-item" onclick="cM();setTimeout(()=>oMF(\''+r.file.replace(/'/g,"\\'")+'\'),200)">';
      h+='<div class="fi fi-'+re+' mdl-rel-fi">'+re.toUpperCase()+'</div>';
      h+='<div class="mdl-rel-body"><div class="mdl-rel-title">'+gTitle(r)+'</div>';
      h+='<div class="mdl-rel-meta">'+r.category+' &middot; '+r.size+'</div></div>';
      h+='<div class="mdl-rel-go" aria-hidden="true">&#8594;</div></div>';
    });
    h+='</div></div>';
  }
  $('mc').innerHTML=h;hardenExternalLinks($('mc'));refreshStatsUI($('mc'));queueStats([d.file].concat(related.map(r=>r.file)));recordStatEvent(d.file,'view',{minIntervalMs:10000,keepalive:true});$('mo').classList.add('open');document.body.style.overflow='hidden';document.body.classList.add('modal-open');document.documentElement.classList.add('modal-open');
}
export function cM(){$('mo').classList.remove('open');document.body.style.overflow='';document.body.classList.remove('modal-open');document.documentElement.classList.remove('modal-open')}
export function tBk(f){if(S.bk.has(f))S.bk.delete(f);else S.bk.add(f);saveBookmarks();$('bkc').textContent=S.bk.size;render()}
export function getDocShareUrl(file){return window.location.origin+'/?doc='+encodeURIComponent(file)}
export function canNativeShare(){return isCompactMobile()&&typeof navigator.share==='function'}
export function shareDoc(file,title){
  const url=getDocShareUrl(file);
  if(!canNativeShare()){copyLink(file);return}
  navigator.share({
    title:title||'Документ',
    text:(title||'Документ')+' — бесплатно в Академическом Салоне',
    url:url
  }).catch(err=>{
    if(err&&err.name!=='AbortError')copyLink(file);
  });
}
export function copyLink(file){
  const url=getDocShareUrl(file);
  navigator.clipboard.writeText(url).then(()=>{
    const btn=document.querySelector('.mdl-share-copy');if(btn){btn.textContent='✓ Скопировано';setTimeout(()=>{btn.innerHTML='&#128279; Ссылка'},1500)}
  }).catch(()=>{})
}
export function shareVK(file,title){const url=getDocShareUrl(file);window.open('https://vk.com/share.php?url='+encodeURIComponent(url)+'&title='+encodeURIComponent(title||''),'_blank','width=600,height=400')}
export function shareTG(file,title){const url=getDocShareUrl(file);window.open('https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent((title||'')+' — бесплатно в Академическом Салоне'),'_blank','width=600,height=400')}
export function addRec(d){S.rec=S.rec.filter(x=>x.file!==d.file);S.rec.unshift(d);if(S.rec.length>8)S.rec.pop();rRec()}
export function rRec(){const s=$('recS'),l=$('recL');if(!S.rec.length){s.style.display='none';return}s.style.display='block';l.innerHTML=S.rec.map(d=>'<span class="rec-c" onclick="sFor(\''+gTitle(d).replace(/'/g,"\\'")+"')\">"+gTitle(d)+'</span>').join('')}
export function sFor(q){syncSearchInputs(q);S.q=q;showCount=PAGE_SIZE;render();window.scrollTo({top:tb.offsetTop-20,behavior:'smooth'})}

export function filterCat(btn){document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');S.cat=btn.dataset.cat;showCount=PAGE_SIZE;render();setMobileSidebar(false)}
export function resetFilters(){
  S.cat='';S.subj='';S.crs='';S.q='';showCount=PAGE_SIZE;
  if($('fSubj'))$('fSubj').value='';
  if($('fCrs'))$('fCrs').value='';
  document.querySelectorAll('.cat-btn').forEach(b=>b.classList.toggle('on',b.dataset.cat===''));
  syncSearchInputs('');
  render();
}
export function clr(k){
  if(k==='cat'){S.cat='';document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('on'));document.querySelector('.cat-btn[data-cat=""]').classList.add('on')}
  else if(k==='subj'){S.subj='';$('fSubj').value=''}
  else if(k==='crs'){S.crs='';$('fCrs').value=''}
  else if(k==='q'){S.q='';syncSearchInputs('')}
  render();
}

