// ════════════════════════════════════════════════════════════════
// ACCOUNT STORE — Stage 0 (invisible cabinet, no auth)
// Device-ID + favorites + history, localStorage-only.
// Backwards-compatible with existing keys (`favorites`, `viewHistory`).
// ════════════════════════════════════════════════════════════════

const K_DEVICE = 'academic-salon:device_id';
const K_FAVS = 'favorites';          // string[] of doc.file paths
const K_HIST = 'viewHistory';         // HistoryEntry[]
const HIST_MAX = 30;

export interface HistoryEntry {
  file: string;   // pathname, e.g. "/doc?file=…"
  title: string;
  time: number;
  slug?: string;
  docFile?: string; // raw catalog file key (files/xxx.pdf) when known
}

type Channel = 'favorites' | 'history';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(K_DEVICE);
    if (id) return id;
    id = generateUUID();
    localStorage.setItem(K_DEVICE, id);
    return id;
  } catch {
    return 'anon';
  }
}

function readFavs(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(K_FAVS) || '[]');
    return Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === 'string') as string[] : [];
  } catch { return []; }
}
function writeFavs(list: string[]) {
  localStorage.setItem(K_FAVS, JSON.stringify(list));
  emit('favorites');
}

export function listFavorites(): string[] { return readFavs(); }
export function isFavorite(file: string): boolean { return readFavs().includes(file); }
export function toggleFavorite(file: string): boolean {
  const favs = readFavs();
  const idx = favs.indexOf(file);
  if (idx === -1) { favs.push(file); writeFavs(favs); return true; }
  favs.splice(idx, 1); writeFavs(favs); return false;
}
export function removeFavorite(file: string): void {
  const favs = readFavs();
  const idx = favs.indexOf(file);
  if (idx !== -1) { favs.splice(idx, 1); writeFavs(favs); }
}
export function clearFavorites(): void { writeFavs([]); }

function readHist(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(K_HIST) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((h: any) => h && typeof h.file === 'string') as HistoryEntry[];
  } catch { return []; }
}
function writeHist(list: HistoryEntry[]) {
  localStorage.setItem(K_HIST, JSON.stringify(list.slice(0, HIST_MAX)));
  emit('history');
}

export function listHistory(): HistoryEntry[] { return readHist(); }
export function addHistory(entry: HistoryEntry): void {
  const list = readHist();
  const filtered = list.filter(h => h.file !== entry.file);
  filtered.unshift({ ...entry, time: entry.time || Date.now() });
  writeHist(filtered);
}
export function removeHistory(file: string): void {
  writeHist(readHist().filter(h => h.file !== file));
}
export function clearHistory(): void { writeHist([]); }

const subs = new Set<(ch: Channel) => void>();
function emit(ch: Channel) { subs.forEach(cb => { try { cb(ch); } catch {} }); }

export function onChange(cb: (ch: Channel) => void): () => void {
  subs.add(cb);
  const sh = (e: StorageEvent) => {
    if (e.key === K_FAVS) cb('favorites');
    else if (e.key === K_HIST) cb('history');
  };
  window.addEventListener('storage', sh);
  return () => { subs.delete(cb); window.removeEventListener('storage', sh); };
}

declare global {
  interface Window {
    academicSalon?: any;
  }
}

if (typeof window !== 'undefined') {
  const app = (window.academicSalon = window.academicSalon || {});
  app.account = {
    getDeviceId,
    listFavorites, isFavorite, toggleFavorite, removeFavorite, clearFavorites,
    listHistory, addHistory, removeHistory, clearHistory,
    onChange,
  };
  getDeviceId();
}
