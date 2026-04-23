# DOC_PLAN — редизайн `/doc/[...slug]` (карточка работы)

> Дата: 2026-04-20. Основа: аудит `doc/[...slug].astro` (~700 строк), визуальный скриншот владельца (заголовок в gold-коробке, DOCX-плашка-квадрат, meta-grid из 4 карточек, огромная SCAN-кнопка, share-строка без иерархии), наблюдения агента.
> Владелец: «карточки вообще не по нашему дизайну, очень кривые… полностью переработать — и дизайн, и функциональность, и фичи».

---

## 1. Что есть сейчас — и почему «кривое»

**Структура (9 блоков один-за-одним):**
1. Breadcrumb «Каталог › Название».
2. Header — eyebrow `ДОКЛАД · 2026` + `h1` в **рамке из gold-hairline** + badge-квадрат `DOCX`.
3. Gold-разделитель.
4. Описание (`max-width: 600px`).
5. `<details>` «Подробнее о документе».
6. Tag-chips (дубль категории).
7. Meta-grid — **4 карточки** (Предмет / Категория / Формат / Год).
8. Download-плашка — золотая кнопка «СКАЧАТЬ» во всю ширину + под ней `СКОПИРОВАТЬ · TG · VK · ★` в 4 колонки.
9. Order-CTA → `/order`.
10. Related (3 шт., только если ≥3 подходящих).

**Что именно ломает Dark Couture** (из аудита + скрин):
- Gold-рамка вокруг `h1` + gold-коробка вокруг description = editorial заголовок НЕ должен быть в контейнере.
- Жёлтый квадрат-badge `DOCX` справа — пустой декор без смысла.
- Meta-grid 4 карточки с borders + gradient — выглядит как «SaaS-дашборд», не библиотечная карточка.
- Download-card с SCAN-кнопкой 56px на всю ширину — это SaaS-CTA, не editorial-action.
- Share-строка: `copy · TG · VK · ★` — 4 микро-действия одной высоты, никакой иерархии.
- Tag-chips дублируют meta (категория = тег «ВКР и дипломы» = дубль).
- Нет OG-image, нет `schema.org`, нет canonical в явном виде на этой странице.
- Description 1–2 строки с `max-width: 600px` на странице 800px — визуально сиротливо.

---

## 2. Концепция — «библиотечное фолио»

Не e-commerce и не SaaS. **Фолио в архиве**: узкая центрированная колонка ~ 820px, редакционный ритм. Как разворот в журнале.

**Принципы:**
- **Одна колонка, вертикаль.** Никакого sticky-sidebar'а справа — это отвлекает и не нужно: каталог у нас не магазин, а библиотека.
- **Заголовок живёт на воздухе** — без рамок, без коробок. `h1` Cormorant Garamond `clamp(40–64px)`, вокруг только пустое пространство.
- **Одна главная кнопка.** Скачать — да, она главная, но не огромная на ширину. Solid-gold editorial, как на `/order`, с аккуратным «DOCX · 17 KB» рядом в подписи.
- **Мета — как на обратной стороне обложки.** Не плашки, а **editorial-таблица** в 2 колонки: «Предмет · Психология / Категория · ВКР и дипломы / Формат · DOCX · 17 KB / Год · 2026». Читается как выходные данные книги.
- **Share в одну минималистичную строку мелко.** `скопировать ссылку · telegram · vk · ★ сохранить` — uppercase 10px mono, без жирных кнопок.
- **Social proof — если есть данные.** Одной строкой под заголовком: `3 скачивания · 14 просмотров за месяц` (из `/api/doc-stats/batch`). Если нет — не показываем.
- **Related — 4–6 работ** как список-строками (не карточками), стиль Archive на главной: номер · название · категория · предмет · год.
- **CTA «Под вашу тему» — в конце, ненавязчиво.** Одна editorial-плашка: «Нужна похожая работа под вашу тему — напишем. → Заказать».

---

## 3. Структура новой страницы

```
/doc/<slug>
│
├── Breadcrumb  (1 строка, mono 10px, gold :hover)
│   Каталог ›  Название (clip 50 символов)
│
├── Eyebrow     (mono 11px gold)
│   ВКР · Психология · 2026
│
├── H1          (Cormorant 40-64px, на воздухе, no box)
│   Доклад к ВКР о социальной адаптации детей-сирот
│
├── Lede        (Cormorant italic 17-19px, max 64ch)
│   Текст выступления или презентационного доклада…
│
├── [optional] Full-text excerpt
│   <details> «Прочесть развёрнуто» — если текст > 200 слов
│
├── Hairline-divider (gold gradient)
│
├── Action-bar  (editorial row, не плашка)
│   ┌─────────────────────────────────────────────────┐
│   │ DOCX · 17 KB                                     │
│   │                                                  │
│   │  [ Скачать ]   сохранить ★   копировать ссылку  │
│   │  solid-gold    minimal btn    text link          │
│   └─────────────────────────────────────────────────┘
│   + одна строка микро-share: «поделиться: telegram · vk»
│
├── Hairline-divider
│
├── Meta-table  (2 колонки: key | value с dotted leader)
│   Предмет     .......... Социальная работа
│   Категория   .......... ВКР и дипломы
│   Формат      .......... DOCX · 17 KB
│   Год         .......... 2026
│   (если есть) Скачано   .......... 3
│   (если есть) Просмотров .......... 14
│
├── Citation   (expandable one-line, gold-link «Скопировать как цитату»)
│   при клике — inline-блок с текстом ГОСТ и кнопкой «Скопировать»
│
├── Hairline-divider
│
├── Related    (5-6 работ, editorial-строки как Archive)
│   V · Похожие работы
│   №   Название                                    Категория   Предмет   Год
│   234 ...............................................................
│
└── CTA «Под вашу тему»  (editorial-плашка, как calendar-hint)
    Нужна похожая работа под вашу тему?
    Напишем с нуля под вашего руководителя и кафедру.
    [ Рассчитать ] → /order?type=<code>&subject=<>&topic=<>
```

---

## 4. Фичи — что добавить, что отложить

### 4.1 Что сделаю сам (Claude, без Codex)

1. **Copy citation** — кнопка «Скопировать как цитату» генерирует строку ГОСТ-2008 из полей doc: `Автор не указан. Название : тип / источник. — 2026. — 17 КБ.` Формат — editorial, clipboard api.
2. **Копировать с utm** — `?utm_source=share&utm_medium=direct` при «копировать ссылку».
3. **Избранное в `localStorage`** — ★ кнопка, state — editorial toggle. Отдельная страница `/saved` — **отложено**, сделаем после согласования этого редизайна.
4. **Social proof** — подключить существующий `/api/doc-stats/batch` к meta-table (скачано / просмотров). Fallback если API молчит — скрываем строку.
5. **Related расширить до 5–6** с fallback-логикой: по subject → по category → по году → случайные.
6. **Schema.org JSON-LD** `ScholarlyArticle` в `<head>` каждой карточки — `headline / description / datePublished / author (Organization) / keywords / isAccessibleForFree: true`.
7. **Canonical** явно в header страницы.
8. **CTA «Под вашу тему»** → `/order?type=<docType>&subject=<subject>&topic=<title>` (prefill уже работает на order.astro).
9. **Убрать** gold-рамку вокруг h1, DOCX-квадрат-badge, 4-карточный meta-grid, дубль tag-chips, SCAN-плашку с grid-footer.
10. **Editorial ритм**: один контейнер 820px, вертикальный, как /about-poster был манифестом, /doc должен быть фолио.

### 4.2 Что только с Codex (запрос в ADMIN_PLAN.md или отдельно)

1. **Preview первой страницы** (PDF → pdf.js на фронте; DOCX → сервер-рендер, `/api/doc-preview?file=...&page=1`). На MVP — без превью, просто заголовок-первый-абзац из `doc.text`, который уже есть в catalog.js.
2. **TOC из DOCX** (mammoth.js на сервере). Отложено.
3. **Word count / reading time / pages** — требует парсинга файла. Можно грубо оценить по длине `doc.text` (≈ 1000 символов = 5 минут чтения), но это приближение. На MVP — скажу «~5 мин» по длине text, если text >= 500 символов.
4. **OG-image dynamic** (`/api/og-image?title=...`) — Codex. На MVP — fallback `/og-image.png`.
5. **Автор / источник** (поделился студентом vs. создано салоном) — требует расширения catalog.js схемы. **Отложено.**

---

## 5. Границы работы

| Задача | Кто | Когда |
|---|---|---|
| Новый HTML/CSS `/doc/[...slug].astro` (editorial фолио) | **Claude** | Этап 2 |
| Citation copy (ГОСТ) + utm-copy + ★ localStorage | **Claude** | Этап 3 |
| Related расширить до 5-6 + fallback | **Claude** | Этап 2 |
| Social proof из `/api/doc-stats/batch` | **Claude** | Этап 2 |
| Schema.org + canonical + cleanup OG | **Claude** | Этап 2 |
| CTA prefill `/order?type=...` | **Claude** | Этап 2 (уже работает, подключить) |
| Preview первой страницы (thumbnails) | **Codex** | Позже |
| TOC из DOCX, word-count, pages | **Codex** | Позже |
| OG-image generator | **Codex** | Позже |
| Автор/источник работы | **Codex** (нужно расширить БД + catalog) | Позже |
| Страница `/saved` (избранное) | **Claude** UI + localStorage | Отдельной итерацией |

---

## 6. Этапы реализации

### Этап 1 — этот коммит
- [x] Аудит (агентом).
- [x] Этот план.

### Этап 2 — следующий сеанс (редизайн UI без новых endpoints)
- [ ] **D.1** Новый frontmatter: category/subject-lookup в workType code (для CTA prefill).
- [ ] **D.2** Полная замена HTML `/doc/[...slug].astro`: breadcrumb → eyebrow → h1 → lede → action-bar → meta-table → citation → related → cta.
- [ ] **D.3** `<style is:global>` с `.doc-*` префиксом (урок `/order` и `/about` учтён).
- [ ] **D.4** Schema.org `ScholarlyArticle` JSON-LD.
- [ ] **D.5** Canonical в `<head>`.
- [ ] **D.6** Убрать: gold-рамки заголовка, DOCX-badge, meta-grid 4-колонный, tag-chips-дубль, SCAN-плашку.
- [ ] **D.7** Related 5–6 работ с fallback (по subject → category → год → random).
- [ ] **D.8** Social proof от `/api/doc-stats/batch` (если ответил).
- [ ] **D.9** CTA `/order?type=<code>&subject=<>&topic=<title>`.

### Этап 3 — сделано
- [x] **D.10** Copy Citation (ГОСТ Р 7.0.100-2018, раскрывающийся editorial-блок).
- [x] **D.11** Favorites в `localStorage` + ★ toggle state.
- [x] **D.12** Utm-copy ссылки (`?utm_source=share&utm_medium=direct`).
- [x] **D.13** Mobile полировка + safe-area на action-bar (480px: кнопка во всю ширину, meta в одну колонку).

### Этап 4 — после Codex
- [ ] **D.14** Preview первой страницы.
- [ ] **D.15** TOC из DOCX.
- [ ] **D.16** Word-count / reading time реальные.
- [ ] **D.17** OG-image dynamic.
- [ ] **D.18** Автор/источник работы.

### Этап 5 — бонус
- [ ] **D.19** `/saved` — страница избранного с фильтрами.

---

## 7. Что НЕ делаем

- Не возвращаем меta-grid 4 карточки. Только таблица 2×N с dotted leader.
- Не делаем золотую SCAN-кнопку во всю ширину. Solid-gold btn-md editorial.
- Не дублируем категорию в tag-chips. Если tag === category — скрываем tag.
- Не добавляем лайков/комментов под работой — это не социалка.
- Не показываем «скачано 143 раза» если в `/api/doc-stats/batch` ноль — fallback на скрытие строки.
- Не делаем author-avatar блок — автор анонимен.
- Не добавляем «рейтинг работы» — оценочно и спорно.

---

## 8. Референсы дизайна

- **Medium article header** — узкая колонка, воздух, typografic hierarchy.
- **Stripe Docs card** — footer-action row, minimal, gold-accent.
- **Наша главная Archive секция (V)** — editorial-ряд с dotted leader = эталон для related-списка и meta-table.
- **Наша главная Formula receipt** — эталон для dotted leader в meta.

---

**Следующий шаг:** этап 2 после вашего «план ок». Если хотите что-то добавить, убрать или поменять направление — скажите до редизайна.
