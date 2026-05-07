/**
 * may9 / live preview
 * Клиентское живое превью карточки эссе при заполнении формы.
 *
 * НЕ генерирует эссе, НЕ касается бэкенда, НЕ меняет JSON-схему отправки.
 * Просто показывает первые поля карточки + одну фразу из ответа,
 * чтобы человек видел, как будет выглядеть его карточка в архиве.
 */

const FORM_ID = 'm9-form';
const PREVIEW_ID = 'm9-preview';

const PLACEHOLDERS = {
  name: '—',
  meta: '',
  quote: 'здесь появится фраза из вашего рассказа',
  author: '—',
};

type PreviewState = {
  heroName: string;
  relation: string;
  years: string;
  place: string;
  q4: string; // эпизод
  q5: string; // запах/привычка
  q9: string; // подпись автора
};

function getEl<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function pickQuote(s4: string, s5: string): string {
  // Берём первую содержательную фразу из q4 (главная история) или q5 (привычка/запах)
  const source = (s4.trim() || s5.trim()).trim();
  if (!source) return '';

  // Первое предложение или первые ~140 символов
  const m = source.match(/^[^.!?\n]+[.!?]?/);
  let chunk = (m ? m[0] : source).trim();
  if (chunk.length > 140) {
    chunk = chunk.slice(0, 140).replace(/\s+\S*$/, '') + '…';
  }
  return chunk;
}

function buildMeta(state: PreviewState): string {
  const parts: string[] = [];
  if (state.relation) parts.push(state.relation.trim());
  if (state.years) parts.push(state.years.trim());
  if (state.place) parts.push(state.place.trim());
  return parts.join(' · ');
}

function update() {
  const form = getEl<HTMLFormElement>(FORM_ID);
  const preview = getEl<HTMLElement>(PREVIEW_ID);
  if (!form || !preview) return;

  const fd = new FormData(form);
  const get = (k: string) => String(fd.get(k) ?? '').trim();

  const state: PreviewState = {
    heroName: get('heroName'),
    relation: get('relation'),
    years: get('years'),
    place: get('place'),
    q4: get('q4'),
    q5: get('q5'),
    q9: get('q9'),
  };

  const isEmpty =
    !state.heroName &&
    !state.relation &&
    !state.years &&
    !state.place &&
    !state.q4 &&
    !state.q5 &&
    !state.q9;

  preview.dataset.empty = isEmpty ? 'true' : 'false';

  const nameEl = preview.querySelector<HTMLElement>('[data-preview-name]');
  if (nameEl) nameEl.textContent = state.heroName || PLACEHOLDERS.name;

  const metaEl = preview.querySelector<HTMLElement>('[data-preview-meta]');
  const meta = buildMeta(state);
  if (metaEl) {
    metaEl.textContent = meta || '';
    metaEl.style.display = meta ? '' : 'none';
  }

  const quoteEl = preview.querySelector<HTMLElement>('[data-preview-quote]');
  if (quoteEl) {
    const quote = pickQuote(state.q4, state.q5);
    quoteEl.textContent = quote ? `«${quote}»` : PLACEHOLDERS.quote;
    quoteEl.dataset.placeholder = quote ? 'false' : 'true';
  }

  const authorEl = preview.querySelector<HTMLElement>('[data-preview-author]');
  if (authorEl) {
    authorEl.textContent = state.q9 || PLACEHOLDERS.author;
  }
}

function init() {
  const form = getEl<HTMLFormElement>(FORM_ID);
  const preview = getEl<HTMLElement>(PREVIEW_ID);
  if (!form || !preview) return;

  // Сразу нарисовать пустое состояние
  update();

  // Дебаунсим, чтобы не рендерить на каждое нажатие
  let timer: number | null = null;
  const handler = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(update, 180);
  };

  form.addEventListener('input', handler);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
