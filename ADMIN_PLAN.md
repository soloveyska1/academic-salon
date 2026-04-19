# ADMIN_PLAN — редизайн админки «Пульт библиотеки»

> Дата: 2026-04-19. Основа: аудит существующего UI (`admin.astro`), бэкенда (`api/routers/admin.py`, `api/auth.py`), пользовательского задания («кабинет-глаз-бога», «одна кнопка — одно действие», «никто кроме меня не зайдёт»).
> Принцип: **я не технарь, значит никаких раскрытых консолей и JSON-выводов. Только кнопки, формы, цифры крупно.**

---

## 0. Источник истины

- Пароль админа — в env `SALON_ADMIN_HASH` на сервере (bcrypt-хэш). Исходный пароль — `hwafl7WCJMJgyvwr8O` (см. `CLAUDE.md`).
- Вход: публичной ссылки в навигации на `/admin` **нет и не будет**. Уже сделано: `<meta name="robots" content="noindex,nofollow,noarchive">`.
- Секретное открытие: 7 кликов по знаку копирайта в футере (legacy-приём из SPA, перенести в Astro-футер) → редирект на `/admin`.
- Токен сессии: 24 ч, в `sessionStorage` (не в localStorage — чтобы чистилось при закрытии вкладки).
- Rate-limit логина: 5 попыток за 60 секунд → 15 минут блокировки (Codex уже реализовал в `auth.py`).

**Доп. шаги безопасности (следующий пуш):**
- `X-Robots-Tag: noindex,nofollow,noarchive,nosnippet` на уровне Nginx для `/admin*` (задача Codex/server).
- Session cookie `HttpOnly; Secure; SameSite=Strict` вместо `sessionStorage` (XSS-безопаснее; требует CSRF-токен, тоже к Codex).
- Опционально: IP allowlist в Nginx для `/api/admin/*` (владелец даёт свои IP).

---

## 1. Что есть сейчас

**UI (`admin.astro`, 534 строки):**

| Вкладка | `data-tab` | Статус |
|---|---|---|
| Обзор | `overview` | ✅ работает |
| Загрузка | `upload` | ✅ работает (`/api/admin/upload`) |
| Входящие работы | `submissions` | ❌ endpoint не существует |
| Каталог | `catalog` | ✅ работает (`/api/admin/docs`) |
| Заявки | `orders` | ⚠️ GET работает, PUT/ответ — нет |
| Система | `delivery` | ⚠️ заглушка |

**Существующие endpoints** (`api/routers/admin.py`): login, logout, verify, docs (GET/PUT/DELETE), orders (GET), analytics (GET), upload (POST), rebuild (POST).

**Существующие таблицы в SQLite:** `doc_counters`, `event_buckets`, `reactions`, `orders`, `contributions`.

---

## 2. Чего хочет владелец (буквально, с его слов)

1. **Загружать работы в каталог** — уже есть, достаточно доточить UX.
2. **Отвечать по заявке** — сейчас можно только прочитать заявку. Нужно: текстовое поле «ответ клиенту» → кнопка «Отправить» → уходит в Telegram/VK/email клиента.
3. **Календарь загрузки** — интерактивный, с отметкой конкретных дней «занято/свободно/срочно», видимый посетителям на главной. Владелец через админку отмечает свой загруз.
4. **«Глаз бога»** — dashboard с ключевыми цифрами крупным шрифтом: сколько заявок ждут ответа, сколько работ на модерации, сколько скачиваний за неделю, сколько дней до ближайшей защиты.
5. **Модерация присланных работ** — пользователи через `/contribute` присылают свои; админ видит список и одной кнопкой публикует или отклоняет.
6. **Профили научных руководителей** — база знаний «что любит Иванов И. И. / на чём срезает Петрова О. С.» (упоминается на главной в Manifesto и Method).
7. **Только я могу войти** — доступ скрыт от публики и поисковиков.

---

## 3. Недостающие endpoints (задачи для Codex)

Эти эндпоинты нужны для реализации. Claude Code НЕ пишет бэкенд — только фронт с ожиданием этих контрактов.

### 3.1 Orders — ответы по заявкам
```
PUT  /api/admin/orders/<id>
     body: { status?: 'new'|'in_progress'|'sent'|'closed',
             internal_note?: string,
             response_to_client?: string }
     returns: { ok: true, order: {...} }

POST /api/admin/orders/<id>/send-response
     body: { channel: 'telegram'|'vk'|'email', message: string }
     returns: { ok: true, deliveredAt: '2026-04-19T...' }
```
> Codex уже реализовал нотификации в `stats_api.py` — можно переиспользовать тот же слой.

### 3.2 Submissions — модерация присланных
```
GET    /api/admin/library-submissions?status=new
       returns: { ok: true, items: [{id, title, subject, category,
                                     contact, description, filename,
                                     created_at, status}] }

GET    /api/admin/library-submissions/<id>
       returns: { ok: true, item: {...}, files: [{url, name, size}] }

PUT    /api/admin/library-submissions/<id>
       body:  { status: 'new'|'priority'|'approved'|'rejected'|'archived',
                note?: string }

POST   /api/admin/library-submissions/<id>/publish
       body:  { title?, description?, tags?, subject?, category?, course? }
       effect: переносит файл из contributions/ в files/, добавляет entry
               в catalog.json, меняет status=approved

DELETE /api/admin/library-submissions/<id>
       effect: удаляет файл из contributions/, запись из БД
```

### 3.3 Calendar — интерактивная сетка загрузок
```
GET    /api/admin/calendar?from=2026-04-01&to=2026-12-31
       returns: { ok: true, days: [{date: '2026-04-19',
                                     state: 'free'|'tight'|'closed'|'booked',
                                     note?: string}] }

PUT    /api/admin/calendar
       body:  { date: '2026-04-19', state: '...', note?: string }
       (upsert по date)

DELETE /api/admin/calendar/<date>
       effect: удалить override (вернуть к декоративному расчёту)
```

Публичный эндпоинт (без авторизации) — для главной:
```
GET /api/calendar/public
    returns: { days: [{date, state}] }  // без note
```

### 3.4 Advisors — профили научных руководителей
```
GET    /api/admin/advisors
POST   /api/admin/advisors      body: {fullName, university, department, notes}
PUT    /api/admin/advisors/<id> body: частичное обновление
DELETE /api/admin/advisors/<id>
```

### 3.5 Bootstrap — один запрос при входе
```
GET /api/admin/bootstrap
    returns: {
      ok: true,
      counts: { newOrders, pendingSubmissions, totalDocs, unreadReactions },
      recentOrders:      [...],
      pendingSubmissions:[...],
      recentDownloads:   [...],
      calendarOverrides: [...],
      categories:        ['ВКР и дипломы', ...],
      subjects:          ['Психология', ...],
    }
```
> Сокращает 5 параллельных запросов до одного, ускоряет загрузку дашборда.

### 3.6 Новые таблицы (задача Codex)
```sql
CREATE TABLE calendar (
  date TEXT PRIMARY KEY,           -- 'YYYY-MM-DD'
  state TEXT NOT NULL,             -- free|tight|closed|booked
  note TEXT,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE advisors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  university TEXT,
  department TEXT,
  notes TEXT,                      -- «что любит / на чём срезает»
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Расширение orders
ALTER TABLE orders ADD COLUMN internal_note TEXT;
ALTER TABLE orders ADD COLUMN response_to_client TEXT;
ALTER TABLE orders ADD COLUMN responded_at INTEGER;
```

---

## 4. Границы Claude Code ↔ Codex

| Работа | Кто |
|---|---|
| Новые endpoints (§3.1–3.6) + миграции SQLite | **Codex** |
| Notification-слой для `send-response` (TG/VK/email) | **Codex** |
| Nginx `X-Robots-Tag`, IP allowlist, HttpOnly cookie + CSRF | **Codex** |
| UI `admin.astro` — новая структура вкладок, «глаз бога» dashboard | **Claude Code** |
| CSS admin-console.css — editorial-тёмный, крупные цифры, понятные кнопки | **Claude Code** |
| JS `public/admin-app.js` — фетчи, формы, optimistic updates | **Claude Code** |
| Публичный `<section id="calendar">` на главной (интеграция с новыми данными) | **Claude Code** |
| 7 кликов по копирайту в Astro-футере → редирект на `/admin` | **Claude Code** |

---

## 5. Этапы редизайна (план работы)

### Этап A — Я (Claude Code) могу сделать сразу, без Codex

- [x] Интерактивный календарь на главной (декоративная модалка с днями) — ✅ сделано в этом пуше.
- [ ] **A.1.** 7-кликов-по-copyright в футере главной — Astro script, редирект на `/admin`.
- [ ] **A.2.** Редизайн UI `admin.astro` без новых endpoints:
  - Новый dashboard (Обзор): крупные цифры (сколько заявок / работ / скачиваний за 7 дней), прямые кнопки «Загрузить работу», «Открыть заявки», «Каталог».
  - Переделать вкладку «Заявки» — большая форма ответа клиенту (работает локально; кнопка «Отправить» disabled, пока Codex не прикрутит endpoint, с пометкой «ждём бэкенд»).
  - Удалить заглушечную вкладку «Система» (или переделать в «Настройки» с одной кнопкой «Пересобрать кэш»).
  - Сделать интерфейс загрузки работы трёхшаговым: файл → автозаполнение полей → проверка → «Опубликовать».
  - Мобильная адаптация (сейчас недружественна к маленьким экранам).

### Этап B — Ждём Codex

- [ ] **B.1.** Codex реализует §3.1 (orders PUT + send-response) → я подключаю форму ответа.
- [ ] **B.2.** Codex реализует §3.2 (submissions) → я подключаю вкладку «Входящие работы».
- [ ] **B.3.** Codex реализует §3.3 (calendar) + публичный endpoint → я подключаю модалку главной к реальным данным и добавляю вкладку «Календарь» в админку.
- [ ] **B.4.** Codex реализует §3.4 (advisors) → я добавляю вкладку «Научные руководители».
- [ ] **B.5.** Codex реализует §3.5 (bootstrap) → я меняю dashboard на один запрос.

### Этап C — Безопасность (после MVP)

- [ ] **C.1.** Nginx `X-Robots-Tag` header для `/admin*` и `/api/admin/*` (Codex).
- [ ] **C.2.** HttpOnly cookie вместо sessionStorage + CSRF-токен (Codex).
- [ ] **C.3.** Опционально: IP allowlist для `/api/admin/*` (Codex; владелец присылает IP).

### Этап D — Полировка

- [ ] **D.1.** Клавиатурные шорткаты: `n` — новая загрузка, `/` — поиск, `?` — справка.
- [ ] **D.2.** Экспорт заявок в CSV (одна кнопка).
- [ ] **D.3.** График скачиваний по дням (Canvas или inline SVG).
- [ ] **D.4.** Backup-напоминание: счётчик «последний бэкап N дней назад».

---

## 6. Цель UX — «одна кнопка = одно действие»

Принципы редизайна (напоминание для себя):

1. **Крупные цифры на дашборде.** Не «заказов: 12», а «**12** заказов ждут ответа» — с кнопкой справа.
2. **Никакого JSON, никаких технических полей.** Если что-то не редактируется владельцем — не показывать.
3. **Предзаполнение форм.** При загрузке работы — вытаскивать категорию/предмет из имени файла, давать подсказки-чипы.
4. **Подтверждения на деструктивные действия.** «Удалить работу?» — два клика, не один.
5. **Статус-line внизу.** «Последнее сохранение: 3 минуты назад», «Всё синхронизировано», «Ошибка — попробовать ещё раз».
6. **Кнопки доступны везде в сайдбаре,** чтобы не нужно было возвращаться на Обзор.
7. **Мобильная адаптация:** я должен иметь возможность принять заявку с телефона.

---

## 7. Что нельзя

- Не ломать контракт `/api/admin/login` — Codex это использует.
- Не хранить пароль в `sessionStorage` / `localStorage`.
- Не логировать body/response тел в DevTools Console в production.
- Не выставлять `/admin` в sitemap.xml, robots.txt, RSS.
- Не добавлять в `<a href="/admin">` ни одной ссылки из публичной части.
- Не делать «восстановление пароля по email» без 2FA — админ только один.

---

**Следующий шаг после мержа этого плана:** A.1 (7-кликов-по-copyright) + A.2 (редизайн dashboard «глаз бога»). Ориентировочно один сеанс. Потом ждём Codex на B.1–B.5.
