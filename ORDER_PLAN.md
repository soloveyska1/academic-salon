# ORDER_PLAN — редизайн `/order` + система скидок, рефералка, личный кабинет

> Дата: 2026-04-19. Основа: аудит `/order.astro` (2285 строк), `/contribute.astro`, `/about.astro`, `/doc/[...slug].astro`.
> Пользовательская задача (дословно): «полностью переработать, переизобрести под визуальный код, максимально удобный, с фичами, рабочая рефералка, скидки для первых и постоянных клиентов, личный кабинет или круче. Без агрессивных продаж, на уровне мозга, комфорта, снятия болей. Доп услуги деликатно. Должен стать визитной карточкой.»

---

## 0. Контракт, который НЕ ломаем

`/api/order/` принимает:
- `multipart/form-data`: поля `workType`, `topic`, `subject`, `deadline`, `contact`, `comment` + до 6 файлов в `files` (повторяемое поле, ≤ 45 МБ суммарно). Rate-limit: 3 заявки/час/IP → 429.
- `application/json`: те же поля без файлов.

Успех → `{ ok: true, id, attachments: [...] }` + нотификации в каналы Codex.

Любой новый UI `/order.astro` **обязан** сохранить:
- имена полей формы ровно такие,
- `files` как `input[type=file][multiple]` или повторяемое поле в FormData,
- обязательность `contact`.

Иначе ломается бэкенд Codex.

---

## 1. Что ломает «наш дизайн» на `/order` (итог аудита)

1. **Пилюли (`.pill`)** — старые токены `--surf + --ac-b`, квадратные. Не editorial.
2. **Receipt-панель** — `--bg2` вместо `--ink-2`, жёсткая тень, не editorial.
3. **Кнопка submit** — не `.btn-gold`, высота < 44px на мобилке.
4. **Hardcode отступы** `24px`/`48px` вместо `var(--sp-*)`.
5. **Hero** — свой собственный, не согласован с Prelude главной.
6. **Process / Method-mini** — дублирует Method главной, но в другом стиле.
7. **Mobile sticky submit** — может налезать на safe-area iPhone.
8. **Валидация контакта** — слишком мягкий regex, пропускает `12-34`.
9. **Draft save** — работает через нестабильный `draftHandle.save()`.
10. **Receipt на 1024–1200px** — не full-width, некрасивый.

---

## 2. UX-принципы новой `/order`

Должно быть **визитной карточкой** — человек приходит посмотреть цену, остаётся оформить. Без агрессии.

- **Один экран — одна задача.** Сначала — что именно нужно (жанр). Потом — объём/темп. Потом — контакты + файлы. Receipt виден всегда, подсчёт обновляется живьём.
- **Крупный receipt вживую.** Итоговая сумма — Cormorant 72px, золото, с разбивкой строк (как на чеке). Это визуальный якорь.
- **Скидки — деликатно, как комплимент.** Не «АКЦИЯ! −15%!» краснюком, а в receipt отдельной строкой курсивом: «Первый заказ у нас — −15%». Gold hairline.
- **Промокод — скрытая ссылка.** По умолчанию поле не показано, ссылка мелко «Есть промокод?» раскрывает поле. Никакого давления.
- **Доп. услуги — чипы, не чекбоксы.** Как на главной Formula. Клик — включил, клик — выключил. С описанием ценности («Слайды по стилю вашего ВУЗа», не просто «Слайды +3 500 ₽»).
- **Снятие болей — подсказки под полями.** «Контакт» → «VK / Telegram / телефон — куда удобнее писать». «Тема» → «Если точной темы ещё нет — напишите направление, обсудим». «Срок» → подсветка в receipt с коэффициентом.
- **Success-экран — не поздравление, а следующий шаг.** «Мы получили заявку. Ольга напишет в ваш Telegram в течение 15 минут. Пока — ваш реферальный код: `AS-XXXXX`, поделитесь с друзьями — им −500 ₽, вам —+500 ₽ на следующую.»

---

## 3. Структура новой страницы

Editorial Dark Couture, как главная. Секции:

```
/order
├── Prelude (hero)
│   ├── Eyebrow:  "Ratio · калькулятор"
│   ├── H1:       «Посчитайте и оформите.»
│   ├── Lede:     одно предложение (1–2 строки) о том что происходит
│   └── Scroll-cue
│
├── I · Calculator  (Caput Primum)
│   ├── Grid 1.3fr / 1fr (как Formula на главной):
│   │   ├── LEFT: 4 ряда выбора (Жанр → Объём → Темп → Дополнения)
│   │   └── RIGHT: Receipt (sticky на desktop)
│   │       ├── Разбивка строк
│   │       ├── Скидка строкой (если применима)
│   │       ├── Промокод строкой (раскрываемо)
│   │       ├── Итого — крупно, Cormorant
│   │       └── CTA «К оформлению» → scroll to form
│   └── Whisper снизу: «Итоговая цена зависит от темы и согласовывается».
│
├── II · Оформление  (Caput Secundum)
│   ├── Форма (поля editorial-underline, как на главной Epilogue-search)
│   │   ├── Предмет + Тема (рядом на desktop)
│   │   ├── Контакт [required]  + помощь «VK / TG / телефон»
│   │   ├── Комментарий (textarea)
│   │   ├── Файлы (drag-drop zone + список-чипы)
│   │   └── «Поделитесь промокодом» (скрытая ссылка разворачивает поле)
│   ├── Trust-signal под формой (NDA · Оригинал · 50/50 оплата)
│   └── CTA «Отправить заявку»  (btn-gold btn-lg, с safe-area на мобилке)
│
├── III · Доверие  (Caput Tertium)  — опционально, может быть reуsed-блок
│   └── 3 плитки: «50/50 оплата» / «Бесплатные правки» / «NDA»
│
└── Epilogue (reuseable)
    └── «Сомневаетесь? Напишите напрямую — @academicsaloon»
```

**Важно:** НЕ дублируем Method / Genres / Archive — они на главной. `/order` лаконичнее — фокус на действии.

---

## 4. Скидочная система

### 4.1 Три уровня скидок (все считаются на бэкенде от `contact` — TG username / email)

| Уровень | Условие (SQL) | Величина | Как показываем в receipt |
|---|---|---|---|
| **Первый заказ** | `COUNT(orders WHERE status='done' AND contact=X) == 0` | **−15%** | «Первый заказ — с комплиментом  −15%» |
| **Постоянный** | `completed_count >= 2` | **−10%** | «Спасибо, что с нами — постоянный клиент −10%» |
| **Длительный** | `completed_count >= 5` | **−15%** | «Пятая работа и больше — −15%» |

Скидки **не складываются**. Применяется максимальная из подходящих.

### 4.2 Реферальная программа

- Каждому клиенту после первой защиты присваивается код `AS-XXXXX` (5 символов, base32).
- Код передаётся либо через query-параметр `?ref=AS-XXXXX` (сохраняется в cookie 30 дней), либо ручным вводом в поле «Промокод».
- **Новый клиент по рефералу** → получает **−7%** на первый заказ (**вместо** −15% «первого»; не складывается).
- **Реферрер** → после успешного платежа нового клиента получает **+500 ₽** на следующий заказ (или +5% от текущего, но не более 2 000 ₽). Кэпируется.
- Срок жизни бонуса — 12 месяцев.

### 4.3 Промокоды

Админ через новую админку может создавать коды:
- Персональные (одноразовые, привязаны к контакту).
- Публичные акции (до N использований или до даты).
- Величина: % или фиксированный ₽.

Схема БД (Codex):
```sql
CREATE TABLE promo_codes (
  code         TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,       -- 'referral' | 'personal' | 'public'
  percent      INTEGER,             -- NULL если fixed
  fixed_rub    INTEGER,             -- NULL если percent
  max_uses     INTEGER,             -- NULL = без лимита
  uses         INTEGER DEFAULT 0,
  bound_contact TEXT,               -- для персональных
  expires_at   INTEGER,
  created_at   INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE customers (
  contact           TEXT PRIMARY KEY,  -- TG @username / email / phone (нормализовано)
  first_order_at    INTEGER,
  orders_total      INTEGER DEFAULT 0,
  orders_done       INTEGER DEFAULT 0,
  referral_code     TEXT UNIQUE,
  referral_bonus_rub INTEGER DEFAULT 0,
  updated_at        INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE referrals (
  referrer_contact TEXT NOT NULL,
  referred_contact TEXT NOT NULL,
  order_id         INTEGER,
  bonus_applied    INTEGER DEFAULT 0,
  created_at       INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (referrer_contact, referred_contact)
);
```

### 4.4 Нужные endpoints (Codex)

```
POST /api/order/preview
  body: { workType, pages, deadline, extras: [], contact?, promoCode? }
  returns:
    {
      ok: true,
      subtotal: 14000,
      volumeDelta: 6000,
      tempoMult: 1.25,
      extras: [{ label, price }],
      discount: { label, percent, rub, origin: 'first'|'returning'|'referral'|'promo' } | null,
      total: 22500
    }
  — НЕ создаёт заявку, только считает. Вызывается при каждом изменении слайдера/пилюли.

GET  /api/customer/summary?contact=<normalized>
  returns:
    {
      ok: true,
      firstOrderAt: int | null,
      ordersDone: 0,
      discountTier: 'first'|'returning'|'loyal'|null,
      referralCode: 'AS-XXXXX' | null,
      referralBonusRub: 500
    }

POST /api/promo/check
  body: { code, contact? }
  returns: { ok: true, valid: bool, reason?: string, discount: {...} | null }
```

**Что это значит для фронта:**
- На клиенте мы показываем **предварительный** расчёт (base × tempo + extras), без скидок.
- Когда пользователь вводит contact → фронт делает `GET /api/customer/summary?contact=…` (debounced 500мс) → если вернулась скидка, показываем её в receipt курсивом.
- При вводе промокода — `POST /api/promo/check` → валидация и применение.
- Финальная сумма всё равно проверяется на бэкенде при `POST /api/order/` — клиент не может подделать цену.

---

## 5. Личный кабинет — архитектура

Три варианта (от простого к серьёзному). **Рекомендую A как MVP**, B — для роста.

### Вариант A. «Магическая ссылка» (MVP, 2–3 дня Codex)

- На странице `/me` — простая форма: «Введите ваш TG/email». Submit → POST `/api/me/request-link` → Codex шлёт в указанный канал ссылку `https://bibliosaloon.ru/me?token=eyJ…` (JWT, 24 часа).
- Клик по ссылке → Astro-страница `/me` с JS читает `?token=` → `GET /api/me?token=…` → возвращает заказы + реф.код + скидку.
- Сервер при логауте — `POST /api/me/logout` (инвалидирует токен).

**Плюсы:** никаких паролей, никаких регистраций. Идентичность = контакт. Клиенту не нужно помнить ещё один пароль. 80% ценности полноценного ЛК.

**Минусы:** нет persistent session — каждый вход = новая ссылка.

### Вариант B. «TG-бот как ЛК» (прод-уровень, 1 неделя Codex)

- `@academicsaloon_bot` — пользователь пишет `/start`, бот запоминает `telegram_user_id` и привязывает к `customers.contact`.
- Команды: `/orders`, `/code` (реф.код), `/discount` (текущая скидка), `/status <id>`.
- Веб — QR-код «Откройте кабинет в TG», веб-страница как сейчас, но с прямой ссылкой «открыть в Telegram».

**Плюсы:** нативный канал, всегда под рукой, нотификации — автоматом.
**Минусы:** TG-only, нужна Codex-разработка бота + webhook.

### Вариант C. «Полный ЛК с регистрацией» (overkill для MVP)

Классика: email + пароль, сессии, recovery. Писать не предлагаю — дорого и не нужно.

**Моя рекомендация — сразу A, после роста базы клиентов — накладываем B сверху.**

### 5.1 Endpoints для ЛК Вариант A (Codex)

```
POST /api/me/request-link     body: { contact }
  — генерит JWT-токен, шлёт в контакт, возвращает { ok: true, channel: 'telegram'|'email' }

GET  /api/me?token=...
  returns:
    {
      ok: true,
      contact: '@username',
      customer: { ordersDone, discountTier, referralCode, referralBonusRub },
      orders: [
        { id, workType, topic, status, total, createdAt, respondedAt, response }
      ]
    }

POST /api/me/logout           body: { token }
```

---

## 6. Границы Claude Code ↔ Codex

| Задача | Кто |
|---|---|
| Редизайн UI `/order.astro` (новая разметка, editorial-токены, калькулятор, форма) | **Claude Code** |
| Preview-API `/api/order/preview` для живого расчёта | **Codex** |
| Таблицы `customers`, `promo_codes`, `referrals` + миграции | **Codex** |
| Endpoints `/api/customer/summary`, `/api/promo/check` | **Codex** |
| При `POST /api/order/` — upsert в `customers`, связь `referrals` | **Codex** |
| Генерация `referral_code` при первом заказе | **Codex** |
| Страница `/me` (Astro) — UI кабинета: форма ввода контакта + экран с заказами | **Claude Code** |
| Endpoints `/api/me/*` + JWT-генерация + отправка магических ссылок | **Codex** |
| Админка: создание промокодов, просмотр customers, реф.статистика | **Claude Code** UI + **Codex** endpoints |
| Cookie `?ref=XYZ` → local storage → передача в форму | **Claude Code** |

---

## 7. Этапы редизайна `/order` (реалистичный график)

### Этап A — Что я сделаю **в следующем сеансе** (не требует Codex)

- [ ] **A.1** Новый `/order.astro` 1-в-1 с editorial-дизайном главной: Prelude + I Calculator + II Оформление + трaст + Epilogue-reuse.
- [ ] **A.2** Калькулятор работает на клиенте (логика из главной Formula, расширенная: promo-поле, скидочная строка в receipt).
- [ ] **A.3** Форма сохраняет контракт `/api/order/` (multipart/JSON, имена полей без изменений).
- [ ] **A.4** Query-prefill `?type=…&topic=…&subject=…` — как раньше.
- [ ] **A.5** Query-prefill `?ref=AS-XXXXX` → сохраняется в `localStorage.refCode` на 30 дней, автоматически подставляется в поле промокода. В receipt — строка «По рекомендации друга − 7%» (**клиентская заглушка** до Codex endpoints — реальная валидация будет позже).
- [ ] **A.6** Чекбокс «Постоянный клиент?» — **не делаю** (будет автоопределяться по контакту, когда Codex добавит summary-endpoint).
- [ ] **A.7** Клиентская валидация контакта — нормальная: `/^@[\w\d_]{3,}$/` для TG, email, `+?\d[\d\s\-\(\)]{8,}` для телефона, `vk.com/…` / `t.me/…` для ссылок.
- [ ] **A.8** Success-screen: «Мы получили заявку, Ольга напишет в течение 15 минут» + placeholder «ваш реф.код появится после оплаты» (real-код потом).
- [ ] **A.9** Mobile sticky CTA с `env(safe-area-inset-bottom)`.
- [ ] **A.10** Schema.org JSON-LD `Service` для SEO `/order`.

### Этап B — После Codex

- [ ] **B.1** Подключить `/api/order/preview` → live-расчёт с учётом скидок/промо.
- [ ] **B.2** Подключить `/api/customer/summary` → автоматическая скидка после ввода контакта.
- [ ] **B.3** Подключить `/api/promo/check` → валидация промокода.
- [ ] **B.4** Success-screen: реальный `referralCode` из ответа `POST /api/order/`.

### Этап C — ЛК (`/me`)

- [ ] **C.1** Claude: UI страница `/me` — форма «Введите контакт» → «Ссылка отправлена в {channel}» → экран с заказами.
- [ ] **C.2** Codex: `/api/me/*`, JWT, отправка ссылок.

### Этап D — Остальные страницы (тоже редизайн)

- [ ] **D.1** `/contribute.astro` — editorial-редизайн, drag-drop в Dark Couture-стиле.
- [ ] **D.2** `/about.astro` — editorial-редизайн, честные тексты из `CLAUDE.md` + `REAL_DATA.md`.
- [ ] **D.3** `/doc/[...slug].astro` — editorial-карточка, Schema.org `ScholarlyArticle`, share-buttons как `.btn-sm`, canonical URL.

---

## 8. Что НЕ делаем

- Нет «таймеров акций», «осталось 3 места», «только сегодня» — давление, ломающее editorial-тон.
- Нет всплывающих окон «успейте заказать».
- Нет chat-виджета.
- Нет регистрации с паролем.
- Нет кросс-sell «купите ещё антиплагиат» после сабмита (пусть Ольга предложит руками).
- Нет «накопительной программы лояльности» в виде карточек с баллами — мы editorial, не супермаркет.

---

## 9. Метрики (что следим после деплоя)

Через Yandex.Metrika 108363627:
- **CR калькулятор → отправка** — сколько людей дошли от клика по жанру до submit.
- **Drop-off** на каждом поле формы — где уходят.
- **Prefill-reach** — сколько заявок пришли с главной `?type=…`.
- **Ref-usage** — сколько заявок пришли с `?ref=…`.

---

**Следующий шаг:** Этап A (в этом или следующем сеансе) — новый `/order.astro`.
