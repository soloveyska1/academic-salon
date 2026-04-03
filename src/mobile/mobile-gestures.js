/**
 * Touch gesture handlers — pull-to-refresh, swipe-back, bottom sheet drag, haptics
 */

/**
 * Trigger haptic feedback via navigator.vibrate
 * @param {'light'|'medium'|'heavy'} style
 */
export function haptic(style = 'light') {
  if (!navigator.vibrate) return;
  const durations = { light: 10, medium: 20, heavy: 30 };
  navigator.vibrate(durations[style] || 10);
}

/**
 * Pull-to-refresh gesture on a scrollable container
 * @param {HTMLElement} container — the scrollable element
 * @param {Function} onRefresh — called when pull completes, receives a `done` callback
 */
export function initPullToRefresh(container, onRefresh) {
  let startY = 0;
  let pulling = false;
  let indicator = null;

  function getIndicator() {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'mob-pull-indicator';
      indicator.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;
      container.parentElement.insertBefore(indicator, container);
    }
    return indicator;
  }

  function onTouchStart(e) {
    if (container.scrollTop > 5) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }

  function onTouchMove(e) {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 0) { pulling = false; return; }

    const progress = Math.min(dy / 120, 1);
    const el = getIndicator();
    const translate = Math.min(dy * 0.5, 60);
    el.style.transform = `translateY(${translate}px)`;
    el.style.opacity = String(progress);
    el.querySelector('svg').style.transform = `rotate(${progress * 360}deg)`;

    if (dy > 60) {
      el.classList.add('mob-pull-ready');
    } else {
      el.classList.remove('mob-pull-ready');
    }
  }

  function onTouchEnd() {
    if (!pulling) return;
    pulling = false;
    const el = getIndicator();
    const ready = el.classList.contains('mob-pull-ready');

    if (ready) {
      haptic('medium');
      el.classList.add('mob-pull-loading');
      onRefresh(() => {
        el.classList.remove('mob-pull-loading', 'mob-pull-ready');
        el.style.transform = 'translateY(0)';
        el.style.opacity = '0';
      });
    } else {
      el.style.transition = 'transform .25s ease, opacity .25s ease';
      el.style.transform = 'translateY(0)';
      el.style.opacity = '0';
      el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
    }
  }

  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: true });
  container.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
    if (indicator && indicator.parentNode) indicator.parentNode.removeChild(indicator);
  };
}

/**
 * Swipe from left edge to trigger back navigation
 * @param {Function} onBack — called when swipe completes
 */
export function initSwipeBack(onBack) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function onTouchStart(e) {
    const x = e.touches[0].clientX;
    if (x > 20) return;
    startX = x;
    startY = e.touches[0].clientY;
    tracking = true;
  }

  function onTouchEnd(e) {
    if (!tracking) return;
    tracking = false;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = Math.abs(touch.clientY - startY);
    if (dx >= 80 && dx > dy * 1.5) {
      haptic('light');
      onBack();
    }
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchend', onTouchEnd);
  };
}

/**
 * Bottom sheet drag-to-dismiss gesture
 * @param {HTMLElement} sheet — the sheet element
 * @param {Function} onDismiss — called when sheet is dragged far enough to close
 */
export function initBottomSheetGestures(sheet, onDismiss) {
  const handle = sheet.querySelector('.mob-sheet-handle');
  if (!handle) return;

  let startY = 0;
  let currentY = 0;
  let dragging = false;

  function onTouchStart(e) {
    startY = e.touches[0].clientY;
    currentY = 0;
    dragging = true;
    sheet.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    currentY = Math.max(0, dy);
    sheet.style.transform = `translateY(${currentY}px)`;

    // Fade overlay proportionally
    const overlay = sheet.previousElementSibling;
    if (overlay && overlay.classList.contains('mob-sheet-overlay')) {
      overlay.style.opacity = String(Math.max(0, 1 - currentY / 300));
    }
  }

  function onTouchEnd() {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = 'transform .3s cubic-bezier(.2,.9,.3,1)';

    if (currentY > 100) {
      haptic('light');
      onDismiss();
    } else {
      // Spring back
      sheet.style.transform = 'translateY(0)';
      const overlay = sheet.previousElementSibling;
      if (overlay && overlay.classList.contains('mob-sheet-overlay')) {
        overlay.style.opacity = '1';
      }
    }
  }

  handle.addEventListener('touchstart', onTouchStart, { passive: true });
  handle.addEventListener('touchmove', onTouchMove, { passive: true });
  handle.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    handle.removeEventListener('touchstart', onTouchStart);
    handle.removeEventListener('touchmove', onTouchMove);
    handle.removeEventListener('touchend', onTouchEnd);
  };
}
