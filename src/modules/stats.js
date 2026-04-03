/**
 * Stats tracking — views, downloads, likes/dislikes
 */
import { STATS_API_ROOT, STATS_CLIENT_KEY } from './constants.js';

function genStatsClientId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
    const a = new Uint32Array(4);
    window.crypto.getRandomValues(a);
    return Array.from(a, n => n.toString(36)).join('');
  }
  return 'cid' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getStatsClientId() {
  try {
    let id = localStorage.getItem(STATS_CLIENT_KEY);
    if (!id) {
      id = genStatsClientId();
      localStorage.setItem(STATS_CLIENT_KEY, id);
    }
    return id;
  } catch {
    return genStatsClientId();
  }
}

/** Stats state object */
export const STATS = {
  clientId: getStatsClientId(),
  map: Object.create(null),
  pending: new Set(),
  timer: 0,
  eventTs: Object.create(null),
  reactionBusy: new Set(),
};

export function getStat(file) {
  if (!file) return { views: 0, downloads: 0, likes: 0, dislikes: 0, reaction: 0 };
  if (!STATS.map[file]) STATS.map[file] = { views: 0, downloads: 0, likes: 0, dislikes: 0, reaction: 0 };
  return STATS.map[file];
}

export function mergeStat(file, data) {
  if (!file || !data) return getStat(file);
  const stat = getStat(file);
  stat.views = Math.max(0, parseInt(data.views, 10) || 0);
  stat.downloads = Math.max(0, parseInt(data.downloads, 10) || 0);
  stat.likes = Math.max(0, parseInt(data.likes, 10) || 0);
  stat.dislikes = Math.max(0, parseInt(data.dislikes, 10) || 0);
  const reaction = parseInt(data.reaction, 10) || 0;
  stat.reaction = reaction === 1 || reaction === -1 ? reaction : 0;
  return stat;
}

export function buildDownloadHref(file) {
  return STATS_API_ROOT + '/download?file=' + encodeURIComponent(file) + '&cid=' + encodeURIComponent(STATS.clientId);
}

export function updateStatScope(scope) {
  if (!scope || !scope.dataset || !scope.dataset.statFile) return;
  const file = scope.dataset.statFile;
  const stat = getStat(file);
  scope.querySelectorAll('[data-stat-count]').forEach(el => {
    const key = el.dataset.statCount;
    el.textContent = String(stat[key] || 0);
  });
  scope.querySelectorAll('[data-reaction-btn]').forEach(btn => {
    const val = parseInt(btn.dataset.reactionBtn, 10) || 0;
    const on = stat.reaction === val;
    btn.classList.toggle('on', on);
    btn.classList.toggle('is-up', val === 1);
    btn.classList.toggle('is-down', val === -1);
    btn.disabled = STATS.reactionBusy.has(file);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('title', val === 1 ? (on ? 'Убрать лайк' : 'Поставить лайк') : (on ? 'Убрать дизлайк' : 'Поставить дизлайк'));
  });
}

export function refreshStatsUI(root) {
  const scopes = [];
  if (root && root.matches && root.matches('[data-stat-file]')) scopes.push(root);
  const nodes = (root || document).querySelectorAll ? (root || document).querySelectorAll('[data-stat-file]') : [];
  nodes.forEach(scope => scopes.push(scope));
  scopes.forEach(updateStatScope);
}

async function flushStatsQueue() {
  const files = [...STATS.pending];
  STATS.pending.clear();
  if (!files.length) return;
  try {
    const res = await fetch(STATS_API_ROOT + '/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, clientId: STATS.clientId }),
    });
    if (!res.ok) throw new Error('stats batch failed');
    const data = await res.json();
    if (data && data.stats) {
      Object.entries(data.stats).forEach(([file, stat]) => mergeStat(file, stat));
      refreshStatsUI(document);
    }
  } catch (e) {
    console.warn('stats batch failed', e);
  }
}

export function queueStats(files) {
  let hasFiles = false;
  (files || []).forEach(file => {
    if (typeof file !== 'string' || !file) return;
    STATS.pending.add(file);
    hasFiles = true;
  });
  if (!hasFiles) return;
  clearTimeout(STATS.timer);
  STATS.timer = setTimeout(flushStatsQueue, 90);
}

function shouldSkipEvent(file, action, minIntervalMs) {
  const key = action + '::' + file;
  const now = Date.now();
  if (minIntervalMs && STATS.eventTs[key] && now - STATS.eventTs[key] < minIntervalMs) return true;
  STATS.eventTs[key] = now;
  return false;
}

export async function recordStatEvent(file, action, opts) {
  const options = opts || {};
  if (!file || shouldSkipEvent(file, action, options.minIntervalMs || 0)) return;
  try {
    const res = await fetch(STATS_API_ROOT + '/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: !!options.keepalive,
      body: JSON.stringify({ file, action, clientId: STATS.clientId }),
    });
    if (!res.ok) throw new Error('stats event failed');
    const data = await res.json();
    if (data && data.stat) {
      mergeStat(file, data.stat);
      refreshStatsUI(document);
    }
  } catch (e) {
    console.warn('stats event failed', e);
  }
}

export function optimisticDownloadBump(file) {
  if (!file || shouldSkipEvent(file, 'download-ui', 2500)) return;
  const stat = getStat(file);
  stat.downloads = (parseInt(stat.downloads, 10) || 0) + 1;
  refreshStatsUI(document);
  setTimeout(() => queueStats([file]), 900);
}

export async function setDocReaction(file, reaction) {
  if (!file || STATS.reactionBusy.has(file)) return;
  STATS.reactionBusy.add(file);
  refreshStatsUI(document);
  try {
    const res = await fetch(STATS_API_ROOT + '/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, reaction, clientId: STATS.clientId }),
    });
    if (!res.ok) throw new Error('stats reaction failed');
    const data = await res.json();
    if (data && data.stat) mergeStat(file, data.stat);
    refreshStatsUI(document);
  } catch (e) {
    console.warn('stats reaction failed', e);
  } finally {
    STATS.reactionBusy.delete(file);
    refreshStatsUI(document);
  }
}
