/**
 * Utility functions
 */

/** Escape HTML attribute value */
export function escAttr(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Pluralize Russian noun */
export function pluralize(n, one, few, many) {
  const m = Math.abs(n) % 100;
  const n1 = m % 10;
  if (m > 10 && m < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

/** Parse size string to bytes */
export function pSz(s) {
  if (!s) return 0;
  const m = s.match(/([\d.]+)\s*(KB|MB|GB)/i);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  const u = m[2].toUpperCase();
  return u === 'GB' ? v * 1e9 : u === 'MB' ? v * 1e6 : v * 1e3;
}

/** Get file extension */
export function gExt(f) {
  const e = f.split('.').pop().toLowerCase();
  return ['docx', 'doc', 'pdf'].includes(e) ? e : 'docx';
}

/** Highlight search query in text */
export function hl(t, q) {
  if (!q || !t) return t || '';
  const e = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return t.replace(new RegExp('(' + e + ')', 'gi'), '<mark>$1</mark>');
}

/** Clean description text */
export function cDesc(t) {
  if (!t) return '';
  return t.replace(/#\S+/g, '').replace(/❗️?Администрация канала[^.]*.?/g, '').replace(/\s+/g, ' ').trim();
}

/** Get document title with disambiguation */
export function gTitle(d) {
  let t = d.catalogTitle || d.title || d.filename.replace(/\.[^.]+$/, '');
  if (d._dupTitle) {
    const extra = [d.subject && d.subject !== 'Общее' ? d.subject : '', d.course, d.docType || d.category].filter(Boolean).join(' · ');
    if (extra) t += ' — ' + extra;
  } else if (d._dup) {
    t += ' — ' + (d.docType || d.category);
  }
  return t;
}

/** Get document description */
export function gDesc(d) {
  return d.catalogDescription || d.description || cDesc(d.text);
}

/** Get primary filename */
export function gPrimaryFilename(d) {
  return d.oldFilename || d.filename || '';
}

/** Get renamed filename */
export function gRenamedFilename(d) {
  return d.newFilename && d.newFilename !== gPrimaryFilename(d) ? d.newFilename : '';
}

/** Estimate page count from file size */
export function estPages(sz) {
  const b = pSz(sz);
  if (!b || b > 5e6) return 0;
  return Math.max(1, Math.round(b / 14000));
}

/** Get contextual price mapping for document category */
export function getCatPrice(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('курсов')) return { type: 'Курсовая', price: 'от 5 000', emoji: '&#128218;' };
  if (c.includes('вкр') || c.includes('диплом')) return { type: 'Дипломная/ВКР', price: 'от 30 000', emoji: '&#127891;' };
  if (c.includes('реферат')) return { type: 'Реферат', price: 'от 2 500', emoji: '&#128196;' };
  if (c.includes('самост') || c.includes('контрол')) return { type: 'Контрольная', price: 'от 2 500', emoji: '&#128221;' };
  return { type: 'Работа на заказ', price: 'от 2 500', emoji: '&#9997;&#65039;' };
}

/** Harden external links with noopener/noreferrer */
export function hardenExternalLinks(root) {
  (root || document).querySelectorAll('a[target="_blank"]').forEach(a => {
    const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    a.setAttribute('rel', [...rel].join(' '));
  });
}

/** Compact mobile check */
export function isCompactMobile() {
  return window.innerWidth <= 640;
}
