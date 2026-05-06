/**
 * may9 / slots polling
 * — раз в 60 секунд опрашивает /api/may9/slots;
 * — обновляет визуальное состояние 20 кружков;
 * — если архив закрыт (closed: true) — гасит форму и показывает заглушку.
 */

const ENDPOINT = '/api/may9/slots';
const POLL_MS = 60_000;

type SlotsResponse = {
  ok: boolean;
  taken: number;
  total: number;
  remaining: number;
  closed: boolean;
};

function getGrid(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-m9-slots]');
}

function setSlotState(grid: HTMLElement, taken: number) {
  const slots = grid.querySelectorAll<HTMLElement>('.m9-slot');
  slots.forEach((el, i) => {
    el.dataset.state = i < taken ? 'taken' : 'free';
  });
  grid.dataset.taken = String(taken);
  grid.setAttribute('aria-label', `Из 20 мест занято — ${taken}`);
}

function setRemaining(remaining: number) {
  const el = document.querySelector<HTMLElement>('[data-m9-slots-remaining]');
  if (el) el.textContent = String(remaining);
}

function showClosedState() {
  const form = document.getElementById('m9-form');
  const formSection = form?.closest('.m9-section');
  if (formSection instanceof HTMLElement) {
    formSection.innerHTML = `
      <div class="m9-wrap-narrow">
        <div class="m9-closed">
          <h2 class="m9-closed-h">В этом году места закончились.</h2>
          <p class="m9-closed-p">
            20 историй уже у нас. Если хотите узнать, когда откроем приём в следующем мае — подпишитесь на канал.
          </p>
          <p style="margin-top: 32px;">
            <a href="https://t.me/academicsaloon"
               target="_blank"
               rel="noopener"
               class="m9-btn">@academicsaloon в Telegram</a>
          </p>
        </div>
      </div>
    `;
  }

  const meta = document.querySelector<HTMLElement>('[data-m9-slots-meta]');
  if (meta) {
    meta.innerHTML = 'Все <strong>20</strong> мест заняты';
  }
}

async function fetchSlots(): Promise<SlotsResponse | null> {
  try {
    const res = await fetch(ENDPOINT, { credentials: 'omit' });
    if (!res.ok) return null;
    return (await res.json()) as SlotsResponse;
  } catch {
    return null;
  }
}

let pollTimer: number | null = null;

async function tick() {
  const grid = getGrid();
  if (!grid) return;

  const data = await fetchSlots();
  if (!data || !data.ok) {
    // Тихо игнорируем — оставляем последнее известное состояние.
    return;
  }

  setSlotState(grid, data.taken);
  setRemaining(data.remaining);

  if (data.closed) {
    showClosedState();
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }
}

function init() {
  if (!getGrid()) return;
  // Первый запрос сразу
  tick();
  // Дальше — раз в минуту, пока вкладка активна
  pollTimer = window.setInterval(() => {
    if (document.hidden) return;
    tick();
  }, POLL_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
