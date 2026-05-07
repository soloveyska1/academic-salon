/**
 * may9 / launcher
 *
 * Глобальный анонс программы «По рассказам». Управляет тремя состояниями:
 *
 *  1. Новый посетитель → показываем модалку. Если закрыл — ставим
 *     `salon:may9:announce-seen=1` и переключаемся в плашку-invite.
 *  2. Видел модалку, истории не отправил → плашка-invite.
 *  3. Отправил историю → плашка-karma («ваш номер N в архиве 2026»).
 *
 * Записи `salon:may9:submitted=1` и `salon:may9:slot=N` делает
 * form.ts на /may9/ после успешного POST /api/may9/voice.
 *
 * Этот скрипт ничего не пишет на сервер. Никаких бэкенд-вызовов.
 */

const KEY_SEEN = 'salon:may9:announce-seen';
const KEY_SUBMITTED = 'salon:may9:submitted';
const KEY_SLOT = 'salon:may9:slot';
const KEY_PILL_DISMISSED = 'salon:may9:pill-invite-dismissed';

type LauncherState = 'modal' | 'invite' | 'karma' | 'none';

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function decideState(currentPath: string): LauncherState {
  // На самой /may9/ ничего не показываем — там и так весь контент.
  if (currentPath.startsWith('/may9')) return 'none';

  const submitted = readKey(KEY_SUBMITTED) === '1';
  if (submitted) return 'karma';

  const seen = readKey(KEY_SEEN) === '1';
  const dismissed = readKey(KEY_PILL_DISMISSED) === '1';
  if (!seen) return 'modal';
  if (dismissed) return 'none';
  return 'invite';
}

function focusableInside(root: HTMLElement): HTMLElement[] {
  const sel =
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(sel));
}

function trapFocus(modal: HTMLElement) {
  const focusables = focusableInside(modal);
  if (!focusables.length) return () => {};
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  modal.addEventListener('keydown', onKey);
  return () => modal.removeEventListener('keydown', onKey);
}

function showModal(modal: HTMLElement) {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  // Фокус на первой кнопке
  const firstAction = modal.querySelector<HTMLElement>('[data-m9l-go]');
  setTimeout(() => firstAction?.focus(), 50);

  const releaseTrap = trapFocus(modal);

  const close = (markSeen = true) => {
    if (markSeen) writeKey(KEY_SEEN, '1');
    modal.hidden = true;
    document.body.style.overflow = '';
    releaseTrap();
    document.removeEventListener('keydown', onEsc);

    // После закрытия модалки — пробуем показать invite-плашку
    refresh();
  };

  function onEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') close(true);
  }
  document.addEventListener('keydown', onEsc);

  modal.querySelectorAll<HTMLElement>('[data-m9l-close]').forEach((btn) => {
    btn.addEventListener('click', () => close(true), { once: true });
  });

  // Переход на /may9/ — модалку считаем «увиденной»
  modal.querySelectorAll<HTMLAnchorElement>('[data-m9l-go]').forEach((a) => {
    a.addEventListener('click', () => {
      writeKey(KEY_SEEN, '1');
      // Не предотвращаем нативный переход
    });
  });
}

function showInvitePill(pill: HTMLElement) {
  pill.hidden = false;

  const dismiss = pill.querySelector<HTMLElement>('[data-m9l-pill-dismiss]');
  if (dismiss) {
    dismiss.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      writeKey(KEY_PILL_DISMISSED, '1');
      pill.hidden = true;
    });
  }
}

function showKarmaPill(pill: HTMLElement) {
  const slot = readKey(KEY_SLOT);
  const slotEl = pill.querySelector<HTMLElement>('[data-m9l-karma-slot]');
  if (slotEl) {
    slotEl.textContent = slot && /^\d+$/.test(slot) ? slot : '—';
  }
  pill.hidden = false;
}

function hideAll() {
  document.querySelectorAll<HTMLElement>('.m9l-modal, .m9l-pill').forEach((el) => {
    el.hidden = true;
  });
  document.body.style.overflow = '';
}

function refresh() {
  const state = decideState(window.location.pathname);
  hideAll();

  if (state === 'modal') {
    const modal = document.getElementById('m9l-modal');
    if (modal) showModal(modal);
  } else if (state === 'invite') {
    const pill = document.getElementById('m9l-pill-invite');
    if (pill) showInvitePill(pill);
  } else if (state === 'karma') {
    const pill = document.getElementById('m9l-pill-karma');
    if (pill) showKarmaPill(pill);
  }
}

function init() {
  refresh();
  // Если в другой вкладке поменялись данные — перерисуем
  window.addEventListener('storage', (e) => {
    if (
      e.key === KEY_SEEN ||
      e.key === KEY_SUBMITTED ||
      e.key === KEY_SLOT ||
      e.key === KEY_PILL_DISMISSED
    ) {
      refresh();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
