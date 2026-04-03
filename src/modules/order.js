/**
 * order.js — Order form, price calculator, and quick order logic.
 */

import { S, $ } from './state.js';
import { AP_CATS, PAGE_SIZE } from './constants.js';
import { showGentleToast, syncSearchInputs, getSelectOptionParts } from './ui.js';
import { escAttr } from './utils.js';

// Late-binding render callback to avoid circular dependency with render.js
let _render = null;
export function setRenderCallback(fn) { _render = fn; }

// Quick order from empty state
export function submitQuickOrder(){
  var topic=($('empTopic')||{}).value||'';
  var contact=($('empContact')||{}).value||'';
  if(!contact.trim()){showGentleToast('Укажите ВК или Telegram для связи');return}
  fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({topic:topic,contact:contact,workType:'',subject:S.subj||'',deadline:'',comment:'Из поиска на сайте'})
  }).then(function(r){return r.json()}).then(function(d){
    if(d.ok)showGentleToast('Заявка отправлена! Мы скоро свяжемся с вами');
    else showGentleToast(d.error||'Ошибка');
  }).catch(function(){showGentleToast('Ошибка сети')});
}

// Global order form modal
export function openOrderForm(prefillTopic,prefillType){
  var ov=document.createElement('div');
  ov.className='order-modal-overlay';
  ov.onclick=function(e){if(e.target===ov)ov.remove()};
  var cats=AP_CATS||["Контрольная","Курсовая","Дипломная","Реферат"];
  ov.innerHTML='<div class="order-modal-card">'
    +'<button class="order-modal-close" onclick="this.closest(\'.order-modal-overlay\').remove()">&#10005;</button>'
    +'<h3 style="font-family:var(--fd);font-size:20px;color:var(--t1);margin-bottom:4px">Оставить заявку</h3>'
    +'<p style="font-size:13px;color:var(--t3);margin-bottom:20px">Бесплатная консультация, без обязательств</p>'
    +'<div style="display:flex;flex-direction:column;gap:10px">'
      +'<input class="ap-input" id="ofTopic" placeholder="Тема работы" value="'+(prefillTopic||'')+'">'
      +'<select class="ap-edit-select" id="ofType"><option value="">Тип работы</option><option'+(prefillType==='Контрольная'?' selected':'')+'>Контрольная</option><option'+(prefillType==='Курсовая'?' selected':'')+'>Курсовая</option><option'+(prefillType==='Дипломная / ВКР'?' selected':'')+'>Дипломная / ВКР</option><option>Магистерская</option><option>Реферат</option><option>Отчёт по практике</option><option>Другое</option></select>'
      +'<input class="ap-input" id="ofDeadline" placeholder="Срок сдачи (например: через 2 недели)">'
      +'<div style="font-size:11px;color:var(--t3);margin-top:2px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Как с вами связаться?</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
        +'<input class="ap-input" id="ofContactVK" placeholder="VK (ник или ссылка)">'
        +'<input class="ap-input" id="ofContactTG" placeholder="Telegram">'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
        +'<input class="ap-input" id="ofContactPhone" placeholder="Телефон">'
        +'<input class="ap-input" id="ofContactEmail" placeholder="Email">'
      +'</div>'
      +'<textarea class="ap-edit-textarea" id="ofComment" placeholder="Комментарий, пожелания (необязательно)" style="min-height:50px"></textarea>'
      +'<input type="text" id="ofWebsite" style="position:absolute;left:-9999px;opacity:0;height:0" tabindex="-1" autocomplete="off">'
      +'<button class="ap-btn-primary" onclick="submitOrderForm()" id="ofBtn">Отправить заявку</button>'
    +'</div>'
    +'<p style="font-size:11px;color:var(--t3);margin-top:12px;opacity:.5;text-align:center">Заполните хотя бы один контакт. Обычно отвечаем за 15 минут.</p>'
  +'</div>';
  document.body.appendChild(ov);
  setTimeout(function(){var c=$('ofContact');if(c)c.focus()},100);
}

export function submitOrderForm(){
  // Honeypot — bots fill hidden fields, humans don't
  if(($('ofWebsite')||{}).value){return}
  var vk=($('ofContactVK')||{}).value||'';
  var tg=($('ofContactTG')||{}).value||'';
  var phone=($('ofContactPhone')||{}).value||'';
  var email=($('ofContactEmail')||{}).value||'';
  var contacts=[];
  if(vk.trim())contacts.push('VK: '+vk.trim());
  if(tg.trim())contacts.push('TG: '+tg.trim());
  if(phone.trim())contacts.push('Тел: '+phone.trim());
  if(email.trim())contacts.push('Email: '+email.trim());
  if(!contacts.length){showGentleToast('Заполните хотя бы один контакт для связи');return}
  var btn=$('ofBtn');btn.disabled=true;btn.textContent='Отправляю...';
  fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      topic:($('ofTopic')||{}).value||'',
      workType:($('ofType')||{}).value||'',
      subject:'',
      deadline:($('ofDeadline')||{}).value||'',
      contact:contacts.join(' | '),
      comment:($('ofComment')||{}).value||''
    })
  }).then(function(r){return r.json()}).then(function(d){
    if(d.ok){var ov=btn.closest('.order-modal-overlay');
      if(ov){ov.querySelector('.order-modal-card').innerHTML='<div style="text-align:center;padding:40px 20px"><div style="font-size:48px;margin-bottom:12px">&#10003;</div><h3 style="font-family:var(--fd);font-size:22px;color:var(--t1);margin-bottom:8px">Заявка отправлена!</h3><p style="font-size:14px;color:var(--t2);line-height:1.6;margin-bottom:6px">Мы свяжемся с вами в течение 15 минут.</p><p style="font-size:13px;color:var(--t3);margin-bottom:20px">Проверьте сообщения в ВК или Telegram.</p><button class="ap-btn-primary" onclick="this.closest(\'div[style*=fixed]\').remove()" style="max-width:200px;margin:0 auto">Понятно</button></div>'}}
    else{showGentleToast(d.error||'Ошибка');btn.disabled=false;btn.textContent='Отправить заявку'}
  }).catch(function(){showGentleToast('Ошибка сети');btn.disabled=false;btn.textContent='Отправить заявку'});
}

// Course collections — shareable filtered views
export function applyCollection(course,subject){
  if(course){S.crs=course;$('fCrs').value=course}
  if(subject){S.subj=subject;$('fSubj').value=subject}
  S.q='';syncSearchInputs('');if(_render)_render(PAGE_SIZE);
  document.getElementById('tb').scrollIntoView({behavior:'smooth',block:'start'});
}

// Price calculator
export function calcPrice(){
  var typeSel=$('calcType'),urgSel=$('calcUrgency'),uniqSel=$('calcUniq');
  if(!typeSel||!urgSel||!uniqSel)return;
  var base=parseInt(typeSel.value)||0;
  var urgency=parseFloat(urgSel.value)||1;
  var uniq=parseFloat(uniqSel.value)||1;
  var total=Math.round(base*urgency*uniq/100)*100;
  $('calcResult').innerHTML='от '+total.toLocaleString('ru-RU')+' &#8381;';
  var typeOpt=typeSel.options[typeSel.selectedIndex]||typeSel.options[0];
  var urgOpt=urgSel.options[urgSel.selectedIndex]||urgSel.options[0];
  var uniqOpt=uniqSel.options[uniqSel.selectedIndex]||uniqSel.options[0];
  var typeParts=getSelectOptionParts(typeSel,typeOpt);
  var urgParts=getSelectOptionParts(urgSel,urgOpt);
  var uniqParts=getSelectOptionParts(uniqSel,uniqOpt);
  var typeLabel=typeParts.label||'Выберите тип';
  var urgencyLabel=urgency===1?'без наценки':(urgParts.meta||('+'+Math.round((urgency-1)*100)+'%'));
  var uniqLabel=uniq===1?(uniqParts.meta||'до 70%'):(uniqParts.meta||('+'+Math.round((uniq-1)*100)+'%'));
  var urgencySummary=urgency>=1.6?'срочный':urgency>1?'ускоренный':'стандарт';
  var uniqSummary=uniq===1?'до 70%':(uniqParts.label&&uniqParts.label.match(/(\d+\s*-\s*\d+%|\d+%\+)/)||[])[1]||uniqLabel;
  if($('calcSummary'))$('calcSummary').textContent=[
    typeLabel,
    urgencySummary,
    uniqSummary
  ].join(' · ');
  if($('calcBase'))$('calcBase').textContent=base.toLocaleString('ru-RU')+' ₽';
  if($('calcUrgencyMeta'))$('calcUrgencyMeta').textContent=urgencyLabel;
  if($('calcUniqMeta'))$('calcUniqMeta').textContent=uniqLabel;
  if($('calcPriceNote'))$('calcPriceNote').textContent=urgency===1&&uniq===1
    ?'Итог зависит от объёма, методички и исходных материалов.'
    :'В расчёте уже учтены выбранные надбавки. Финальную цену подтверждаем после оценки задания.';
}
