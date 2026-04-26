// Cabinet calendar runtime — plain JS so it can be inlined directly
// from Calendar.astro via <script is:inline> (Astro v6 silently drops
// hoisted <script> blocks from this component otherwise).
(function() {
  // ════════════════════════════════════════════════════════════════
  // CALENDAR — click-to-open day grid dialog
  // Past months → 'closed'. Current and future months → 'free' unless
  // an admin override (per-day) tightens or closes them.
  // ════════════════════════════════════════════════════════════════

  var MONTH_NAMES_NOM = [
    'Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
  ];
  var MONTH_NAMES_GEN = [
    'января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря',
  ];

  // Pull server-side overrides once per page-load. Quietly fails when
  // the API is offline so the homepage never breaks.
  function syncServerCalendar() {
    fetch('/api/calendar', { cache: 'no-store' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data || !data.ok || !Array.isArray(data.items)) return;
        var map = {};
        data.items.forEach(function(it) {
          if (it && it.date && it.state) map[it.date] = it.state;
        });
        try { localStorage.setItem('academic-salon:calendar', JSON.stringify(map)); } catch (_) {}
        applyMonthOverrides(map);
      })
      .catch(function() {});
  }

  // Roll up admin per-day overrides into the month buttons:
  //   ≥1 busy/tight day  → 'tight', label 'N зан.'  (мало окон)
  //   only closed days   → 'closed', label '—'       (закрыт)
  //   only free days     → 'free',  label 'N своб.'  (открыто)
  function applyMonthOverrides(map) {
    var section = document.getElementById('calendar');
    if (!section) return;
    var buttons = section.querySelectorAll('.month');
    if (!buttons.length) return;
    var yearAttr = section.getAttribute('data-calendar-year');
    var year = yearAttr ? parseInt(yearAttr, 10) : new Date().getFullYear();

    buttons.forEach(function(btn) {
      var monthIdx = parseInt(btn.getAttribute('data-month-index') || '-1', 10);
      if (monthIdx < 0) return;

      var busyOrTight = 0;
      var closedDays = 0;
      var freeDays = 0;
      var monthPrefix = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-';
      Object.keys(map).forEach(function(date) {
        if (date.indexOf(monthPrefix) !== 0) return;
        var state = map[date];
        if (state === 'busy' || state === 'tight') busyOrTight += 1;
        else if (state === 'closed') closedDays += 1;
        else if (state === 'free') freeDays += 1;
      });
      if (busyOrTight === 0 && closedDays === 0 && freeDays === 0) return;

      var nextState, nextSub, nextTitle;
      if (busyOrTight >= 1) {
        nextState = 'tight';
        nextSub = 'мало окон';
        nextTitle = busyOrTight + ' зан.';
      } else if (closedDays >= 1 && freeDays === 0) {
        nextState = 'closed';
        nextSub = 'закрыт';
        nextTitle = '—';
      } else {
        nextState = 'free';
        nextSub = 'открыто';
        nextTitle = freeDays + ' своб.';
      }

      btn.classList.remove('free', 'tight', 'closed');
      btn.classList.add(nextState);
      btn.setAttribute('data-month-state', nextState);
      var stat = btn.querySelector('.month-stat');
      if (stat) stat.innerHTML = '<b>' + nextTitle + '</b>' + nextSub;
    });
  }

  function readCalOverrides() {
    try {
      var raw = localStorage.getItem('academic-salon:calendar');
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) { return {}; }
  }

  function ymd(year, monthIdx, day) {
    return year + '-' + String(monthIdx + 1).padStart(2, '0') +
           '-' + String(day).padStart(2, '0');
  }

  function buildDays(year, monthIdx, todayYear, todayMonth, todayDay) {
    var first = new Date(year, monthIdx, 1);
    var last = new Date(year, monthIdx + 1, 0);
    var daysInMonth = last.getDate();
    var firstDow = (first.getDay() + 6) % 7;

    var overrides = readCalOverrides();
    var cells = [];
    for (var i = 0; i < firstDow; i++) cells.push({ day: null, state: 'empty' });

    for (var d = 1; d <= daysInMonth; d++) {
      var key = ymd(year, monthIdx, d);
      var isPastMonth = year < todayYear ||
        (year === todayYear && monthIdx < todayMonth);
      var isFutureMonth = year > todayYear ||
        (year === todayYear && monthIdx > todayMonth);

      var dow = new Date(year, monthIdx, d).getDay();
      var isWeekend = (dow === 0 || dow === 6);

      var state;
      if (overrides[key]) {
        state = overrides[key];
      } else if (isPastMonth) {
        state = 'closed';
      } else if (isFutureMonth) {
        // Default-open until admin says otherwise.
        state = 'free';
      } else {
        // Current month: past days closed, today highlighted, rest open.
        if (d < todayDay) state = 'closed';
        else if (d === todayDay) state = 'today';
        else state = 'free';
      }
      cells.push({ day: d, state: state, weekend: isWeekend });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, state: 'empty' });
    return cells;
  }

  function initCalendarModal() {
    var section = document.getElementById('calendar');
    var modal = document.getElementById('calModal');
    if (!section || !modal) return;
    if (typeof modal.showModal !== 'function') return;

    var year = Number(section.getAttribute('data-calendar-year')) || new Date().getFullYear();
    var todayMonth = Number(section.getAttribute('data-calendar-month'));
    var todayDay = Number(section.getAttribute('data-calendar-today'));

    var grid = modal.querySelector('#calModalGrid');
    var title = modal.querySelector('#calModalTitle');
    var note = modal.querySelector('#calModalNote');
    var closeBtn = modal.querySelector('#calModalClose');

    function open(monthIdx, stateLabel) {
      if (!grid || !title || !note) return;
      var monthYear = (monthIdx < todayMonth) ? year + 1 : year;
      title.innerHTML = MONTH_NAMES_NOM[monthIdx] + ' · <em>' + monthYear + '</em>';

      var cells = buildDays(monthYear, monthIdx, year, todayMonth, todayDay);
      grid.innerHTML = cells.map(function(c) {
        if (c.state === 'empty') return '<span class="cal-day empty" aria-hidden="true"></span>';
        var aria = c.day + ' ' + MONTH_NAMES_GEN[monthIdx];
        var cls = 'cal-day ' + c.state + (c.weekend ? ' weekend' : '');
        return '<span class="' + cls + '" role="gridcell" aria-label="' + aria + '">' + c.day + '</span>';
      }).join('');

      var noteText =
        stateLabel === 'closed' ? MONTH_NAMES_NOM[monthIdx] + ' уже прошёл. Ближайшие окна — в следующих месяцах.'
        : stateLabel === 'tight' ? MONTH_NAMES_NOM[monthIdx] + ' идёт плотно. Напишите — подберём конкретные даты.'
        : MONTH_NAMES_NOM[monthIdx] + ' — окна открыты. Точные даты обсудим в Telegram.';
      note.textContent = noteText;

      modal.showModal();
      document.body.style.overflow = 'hidden';
    }

    function close() {
      modal.close();
      document.body.style.overflow = '';
    }

    section.querySelectorAll('.month').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idxStr = btn.getAttribute('data-month-index');
        var stateLabel = btn.getAttribute('data-month-state') || 'free';
        if (idxStr === null) return;
        var relative = Number(idxStr);
        var absoluteMonth = (todayMonth + relative) % 12;
        open(absoluteMonth, stateLabel);
      });
    });

    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('click', function(e) {
      var body = modal.querySelector('.cal-modal-body');
      if (!body) return;
      var r = body.getBoundingClientRect();
      var clickedInside =
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom;
      if (!clickedInside) close();
    });
    modal.addEventListener('cancel', function() {
      document.body.style.overflow = '';
    });
  }

  syncServerCalendar();
  initCalendarModal();
  document.addEventListener('astro:page-load', function() {
    syncServerCalendar();
    initCalendarModal();
  });
})();
