/**
 * may9 / form controller
 * Управляет формой «По рассказам»:
 * — собирает данные по контракту POST /api/may9/voice;
 * — валидация на клиенте + honeypot;
 * — состояния idle / sending / success / error;
 * — переключает страницу на финальный экран после успеха;
 * — сохраняет черновик в localStorage.
 */

const FORM_ID = 'm9-form';
const ERROR_ID = 'm9-error';
const THANKS_ID = 'm9-thanks';
const DRAFT_KEY = 'salon:may9:voice:v1';
const ENDPOINT = '/api/may9/voice';

type SlotsResponse = {
  ok: boolean;
  taken: number;
  total: number;
  remaining: number;
  closed: boolean;
};

type VoiceResponse = {
  ok: boolean;
  id: number;
  status: string;
  taken: number;
  total: number;
  rewardCode?: string;
  message?: string;
};

function getEl<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showError(message: string) {
  const el = getEl<HTMLDivElement>(ERROR_ID);
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideError() {
  const el = getEl<HTMLDivElement>(ERROR_ID);
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}

function readDraft(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeDraft(form: HTMLFormElement) {
  try {
    const data: Record<string, string> = {};
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string') data[k] = v;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    /* private mode etc. — fail silently */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function restoreDraft(form: HTMLFormElement) {
  const draft = readDraft();
  if (!draft) return;
  for (const [k, v] of Object.entries(draft)) {
    const el = form.elements.namedItem(k);
    if (!el) continue;
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox') {
        el.checked = v === 'on' || v === 'true';
      } else if (el.type !== 'file') {
        el.value = v;
      }
    } else if (el instanceof HTMLTextAreaElement) {
      el.value = v;
    }
  }
}

function buildPayload(form: HTMLFormElement) {
  const fd = new FormData(form);
  const get = (k: string) => String(fd.get(k) ?? '').trim();

  return {
    name: get('name'),
    email: get('email'),
    telegram: get('telegram'),
    relation: get('relation'),
    heroName: get('heroName'),
    years: get('years'),
    place: get('place'),
    answers: {
      q1: get('q1'),
      q2: get('q2'),
      q3: get('q3'),
      q4: get('q4'),
      q5: get('q5'),
      q6: get('q6'),
      q7: get('q7'),
      q8: get('q8'),
      q9: get('q9'),
    },
    publishConsent: fd.get('publishConsent') === 'on',
    pdConsent: fd.get('pdConsent') === 'on',
    contactConsent: fd.get('contactConsent') === 'on',
    source: 'may9_voice',
    honeypot: get('honeypot'),
  };
}

function validate(payload: ReturnType<typeof buildPayload>): string | null {
  if (payload.honeypot) {
    // Тихо отклоняем бота — но возвращаем «успех» с задержкой не делаем,
    // просто не отправляем и не показываем ошибку (бот не получит сигнал).
    return '__bot__';
  }
  if (!payload.heroName || payload.heroName.length < 2) {
    return 'Не хватает имени человека, про которого расскажете.';
  }
  if (!payload.name || payload.name.length < 2) {
    return 'Не хватает вашего имени.';
  }
  if (!payload.email || !/^\S+@\S+\.\S+$/.test(payload.email)) {
    return 'Email — без него не сможем прислать PDF.';
  }
  if (!payload.pdConsent) {
    return 'Нужно согласие на обработку персональных данных.';
  }
  if (!payload.contactConsent) {
    return 'Нужно согласие на связь — иначе не пришлём эссе.';
  }
  // Хотя бы один ответ должен быть
  const anyAnswer = Object.values(payload.answers).some((v) => v && v.length >= 3);
  if (!anyAnswer) {
    return 'Расскажите хотя бы что-то — пары предложений достаточно.';
  }
  return null;
}

async function submitForm(payload: ReturnType<typeof buildPayload>): Promise<VoiceResponse> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 410) {
    throw new Error('CLOSED');
  }
  if (res.status === 429) {
    throw new Error('RATE_LIMIT');
  }
  if (!res.ok) {
    let serverMsg = '';
    try {
      const data = await res.json();
      serverMsg = data?.error || data?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(serverMsg || 'Ошибка сервера. Попробуйте через минуту.');
  }

  return (await res.json()) as VoiceResponse;
}

function setSendingState(form: HTMLFormElement, sending: boolean) {
  form.dataset.state = sending ? 'sending' : 'idle';
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (btn) btn.disabled = sending;
}

function showThanks(payload: ReturnType<typeof buildPayload>, response: VoiceResponse) {
  const form = getEl<HTMLFormElement>(FORM_ID);
  const thanks = getEl<HTMLElement>(THANKS_ID);
  if (!thanks || !form) return;

  // Подставляем имя предка в финальное сообщение
  const nameSlot = thanks.querySelector('[data-m9-thanks-name]');
  if (nameSlot && payload.heroName) {
    nameSlot.textContent = payload.heroName;
  }
  const slotSlot = thanks.querySelector('[data-m9-thanks-slot]');
  if (slotSlot && typeof response.taken === 'number') {
    slotSlot.textContent = String(response.taken);
  }

  thanks.dataset.visible = 'true';

  // Скрываем форму и заголовки секций «вопросы» / «как это работает»
  form.style.display = 'none';
  const formSection = form.closest('.m9-section');
  if (formSection instanceof HTMLElement) formSection.style.display = 'none';

  // Скроллим к финальному экрану
  thanks.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function init() {
  const form = getEl<HTMLFormElement>(FORM_ID);
  if (!form) return;

  // Восстанавливаем черновик
  restoreDraft(form);

  // Сохраняем черновик с дебаунсом
  let draftTimer: number | null = null;
  form.addEventListener('input', () => {
    if (draftTimer) window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => writeDraft(form), 600);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const payload = buildPayload(form);
    const validationError = validate(payload);

    if (validationError === '__bot__') {
      // Тихо игнорируем — бот ушёл «в никуда».
      return;
    }
    if (validationError) {
      showError(validationError);
      return;
    }

    setSendingState(form, true);
    try {
      const response = await submitForm(payload);
      clearDraft();

      // Метрика: успех
      try {
        (window as any).ym?.(108363627, 'reachGoal', 'may9_voice_submit_success');
      } catch {
        /* ignore */
      }

      showThanks(payload, response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не получилось отправить.';
      if (msg === 'CLOSED') {
        showError('20 историй уже у нас — в этом году места закончились. Спасибо за интерес.');
      } else if (msg === 'RATE_LIMIT') {
        showError('Слишком много заявок с одного устройства. Попробуйте через час или с другого браузера.');
      } else {
        showError(`${msg} Если повторится — напишите в Telegram.`);
      }
      try {
        (window as any).ym?.(108363627, 'reachGoal', 'may9_voice_submit_error');
      } catch {
        /* ignore */
      }
    } finally {
      setSendingState(form, false);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Экспорт типов на случай, если другие скрипты захотят их использовать
export type { SlotsResponse, VoiceResponse };
