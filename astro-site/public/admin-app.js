const TOKEN_KEY = "salon-admin-token";
const ACTIVE_TAB_KEY = "salon-admin-tab";
const REQUEST_TIMEOUT_MS = 15000;

const ORDER_STATUS_OPTIONS = [
  ["new", "Новая"],
  ["priority", "Приоритет"],
  ["in_work", "В работе"],
  ["waiting_client", "Ждём клиента"],
  ["done", "Завершена"],
  ["archived", "Архив"],
];

const SUBMISSION_STATUS_OPTIONS = [
  ["new", "Новая"],
  ["priority", "Приоритет"],
  ["approved", "Опубликована"],
  ["rejected", "Отклонена"],
  ["delivery_failed", "Сбой доставки"],
  ["archived", "Архив"],
];

const TAB_META = {
  overview: {
    eyebrow: "Обзор",
    title: "Пульт библиотеки",
    lead: "Главное на сейчас.",
  },
  upload: {
    eyebrow: "Загрузка",
    title: "Новая работа",
    lead: "Ручная загрузка в каталог.",
  },
  submissions: {
    eyebrow: "Входящие работы",
    title: "Разбор присланных работ",
    lead: "Разбор и публикация без ручных обходов.",
  },
  catalog: {
    eyebrow: "Каталог",
    title: "Управление опубликованными документами",
    lead: "Редактирование опубликованных работ.",
  },
  orders: {
    eyebrow: "Заявки",
    title: "Клиенты, которые написали с сайта",
    lead: "Контакт, файлы, статус и заметка.",
  },
  calendar: {
    eyebrow: "Календарь",
    title: "Загрузка по дням",
    lead: "Отмечаем занятые и плотные дни — сразу видно на главной.",
  },
};

function initAdminApp() {
  const root = document.getElementById("adminApp");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || "",
    activeTab: sessionStorage.getItem(ACTIVE_TAB_KEY) || "overview",
    docs: [],
    orders: [],
    submissions: [],
    analytics: null,
    outbox: null,
    health: null,
    selectedDocFile: "",
    selectedOrderId: 0,
    selectedSubmissionId: 0,
    uploadFile: null,
    options: {
      categories: [],
      subjects: [],
      courses: [],
      docTypes: [],
    },
    lastSyncAt: 0,
  };

  const els = {
    tabs: Array.from(document.querySelectorAll(".admin-nav-btn")),
    workspaceEyebrow: document.getElementById("workspaceEyebrow"),
    workspaceTitle: document.getElementById("workspaceTitle"),
    workspaceLead: document.getElementById("workspaceLead"),
    sessionState: document.getElementById("adminSessionState"),
    lastSync: document.getElementById("adminLastSync"),
    authCard: document.getElementById("adminAuthCard"),
    workspace: document.getElementById("adminWorkspace"),
    refreshBtn: document.getElementById("adminRefreshBtn"),
    logoutBtn: document.getElementById("adminLogoutBtn"),
    loginForm: document.getElementById("adminLoginForm"),
    password: document.getElementById("adminPassword"),
    passwordToggle: document.getElementById("adminPasswordToggle"),
    capsHint: document.getElementById("adminCapsHint"),
    loginBtn: document.getElementById("adminLoginBtn"),
    loginError: document.getElementById("adminLoginError"),
    kbdHelp: document.getElementById("adminKbdHelp"),
    kbdHelpClose: document.getElementById("adminKbdHelpClose"),
    toastStack: document.getElementById("adminToasts"),
    commandSearch: document.getElementById("commandSearch"),
    commandResults: document.getElementById("commandResults"),
    commandShortcuts: document.getElementById("commandShortcuts"),

    navCountOverview: document.getElementById("navCountOverview"),
    navCountSubmissions: document.getElementById("navCountSubmissions"),
    navCountCatalog: document.getElementById("navCountCatalog"),
    navCountOrders: document.getElementById("navCountOrders"),

    overviewHeroTiles: document.getElementById("overviewHeroTiles"),
    overviewAttention: document.getElementById("overviewAttention"),
    overviewAttentionCount: document.getElementById("overviewAttentionCount"),
    actionCardOrders: document.getElementById("actionCardOrders"),
    actionCardSubmissions: document.getElementById("actionCardSubmissions"),
    overviewSystem: document.getElementById("overviewSystem"),
    overviewRecentOrders: document.getElementById("overviewRecentOrders"),
    overviewRecentSubmissions: document.getElementById("overviewRecentSubmissions"),

    uploadForm: document.getElementById("adminUploadForm"),
    uploadFileInput: document.getElementById("adminUploadFile"),
    uploadFileInfo: document.getElementById("adminUploadFileInfo"),
    uploadDropzone: document.getElementById("adminDropzone"),
    uploadBtn: document.getElementById("uploadSubmitBtn"),
    uploadStatus: document.getElementById("uploadStatus"),
    uploadProgress: document.getElementById("uploadProgress"),
    uploadProgressFill: document.getElementById("uploadProgressFill"),
    uploadSmartPreview: document.getElementById("uploadSmartPreview"),
    uploadCategoryPicks: document.getElementById("uploadCategoryPicks"),
    uploadSubjectPicks: document.getElementById("uploadSubjectPicks"),
    uploadDocTypePicks: document.getElementById("uploadDocTypePicks"),
    uploadTitle: document.getElementById("uploadTitle"),
    uploadDescription: document.getElementById("uploadDescription"),
    uploadCategory: document.getElementById("uploadCategory"),
    uploadSubject: document.getElementById("uploadSubject"),
    uploadCourse: document.getElementById("uploadCourse"),
    uploadDocType: document.getElementById("uploadDocType"),
    uploadTags: document.getElementById("uploadTags"),

    categoryOptions: document.getElementById("categoryOptions"),
    subjectOptions: document.getElementById("subjectOptions"),
    courseOptions: document.getElementById("courseOptions"),
    docTypeOptions: document.getElementById("docTypeOptions"),

    submissionSearch: document.getElementById("submissionSearch"),
    submissionStatusFilter: document.getElementById("submissionStatusFilter"),
    submissionStatusPills: document.getElementById("submissionStatusPills"),
    submissionQueueBar: document.getElementById("submissionQueueBar"),
    submissionList: document.getElementById("submissionList"),
    submissionEmpty: document.getElementById("submissionEmpty"),
    submissionDetail: document.getElementById("submissionDetail"),

    catalogSearch: document.getElementById("catalogSearch"),
    catalogQuickFilter: document.getElementById("catalogQuickFilter"),
    catalogQueueBar: document.getElementById("catalogQueueBar"),
    catalogList: document.getElementById("catalogList"),
    catalogEmpty: document.getElementById("catalogEmpty"),
    catalogEditor: document.getElementById("catalogEditor"),
    catalogTitle: document.getElementById("catalogTitle"),
    catalogDescription: document.getElementById("catalogDescription"),
    catalogCategory: document.getElementById("catalogCategory"),
    catalogSubject: document.getElementById("catalogSubject"),
    catalogCourse: document.getElementById("catalogCourse"),
    catalogDocType: document.getElementById("catalogDocType"),
    catalogTags: document.getElementById("catalogTags"),
    catalogMeta: document.getElementById("catalogMeta"),
    catalogOpenBtn: document.getElementById("catalogOpenBtn"),
    catalogSaveBtn: document.getElementById("catalogSaveBtn"),
    catalogDeleteBtn: document.getElementById("catalogDeleteBtn"),
    catalogStatus: document.getElementById("catalogStatus"),

    orderSearch: document.getElementById("orderSearch"),
    orderStatusFilter: document.getElementById("orderStatusFilter"),
    orderStatusPills: document.getElementById("orderStatusPills"),
    orderStatusPillsDetail: document.getElementById("orderStatusPillsDetail"),
    orderQueueBar: document.getElementById("orderQueueBar"),
    orderList: document.getElementById("orderList"),
    orderEmpty: document.getElementById("orderEmpty"),
    orderEditor: document.getElementById("orderEditor"),
    orderSummary: document.getElementById("orderSummary"),
    orderClientHistory: document.getElementById("orderClientHistory"),
    orderContext: document.getElementById("orderContext"),
    orderStatus: document.getElementById("orderStatus"),
    orderNote: document.getElementById("orderNote"),
    orderNoteHint: document.getElementById("orderNoteHint"),
    orderResponseHint: document.getElementById("orderResponseHint"),
    orderFilesBlock: document.getElementById("orderFilesBlock"),
    orderFilesHint: document.getElementById("orderFilesHint"),
    orderAttachments: document.getElementById("orderAttachments"),
    orderSaveBtn: document.getElementById("orderSaveBtn"),
    orderStatusNote: document.getElementById("orderStatusNote"),
    orderResponse: document.getElementById("orderResponse"),
    orderResponseChannel: document.getElementById("orderResponseChannel"),
    orderSendBtn: document.getElementById("orderSendBtn"),
    orderCopyResponseBtn: document.getElementById("orderCopyResponseBtn"),
    orderResponseNote: document.getElementById("orderResponseNote"),

    deliveryMetrics: document.getElementById("deliveryMetrics"),
    deliveryJobs: document.getElementById("deliveryJobs"),
    deliveryTech: document.getElementById("deliveryTech"),
    deliveryCleanupBtn: document.getElementById("deliveryCleanupBtn"),
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function truncate(value, max = 160) {
    const text = String(value || "").trim();
    if (!text || text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeSearchText(value) {
    return cleanText(value).toLowerCase();
  }

  function stripHtml(text) {
    return cleanText(
      String(text || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&amp;/gi, "&")
    );
  }

  function htmlErrorMessage(text, status) {
    const titleMatch = String(text || "").match(/<title[^>]*>(.*?)<\/title>/i);
    const title = cleanText(titleMatch ? titleMatch[1] : "");
    const stripped = stripHtml(text);
    return truncate(title || stripped || `HTTP ${status}`, 180);
  }

  function readErrorMessage(payload, text, status) {
    if (payload && typeof payload === "object") {
      const direct = cleanText(payload.error || payload.detail || payload.message || "");
      if (direct) return truncate(direct, 180);
    }
    return htmlErrorMessage(text, status);
  }

  function formatDate(timestamp) {
    if (!timestamp) return "—";
    try {
      return new Date(Number(timestamp) * 1000).toLocaleString("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Moscow",
      });
    } catch (_error) {
      return "—";
    }
  }

  function formatShortDate(timestamp) {
    if (!timestamp) return "—";
    try {
      return new Date(Number(timestamp) * 1000).toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Moscow",
      });
    } catch (_error) {
      return "—";
    }
  }

  function formatClientDate(timestamp) {
    if (!timestamp) return "Ещё не обновляли";
    try {
      return `Обновлено ${new Date(timestamp).toLocaleString("ru-RU", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Moscow",
      })}`;
    } catch (_error) {
      return "Ещё не обновляли";
    }
  }

  function isCompactLayout() {
    return window.matchMedia("(max-width: 1180px)").matches;
  }

  function revealOnCompactLayout(element) {
    if (!element || !isCompactLayout()) return;
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function withButtonBusy(button, busyLabel, task) {
    if (!button) return task();
    const initialLabel = button.dataset.label || button.textContent || "";
    button.dataset.label = initialLabel;
    button.disabled = true;
    button.textContent = busyLabel;
    try {
      return await task();
    } finally {
      button.disabled = false;
      button.textContent = initialLabel;
    }
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (!size) return "—";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Russian plural: one / few / many forms, e.g. pluralize(3, ["дело","дела","дел"])
  function pluralize(count, forms) {
    const n = Math.abs(Number(count) || 0) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  const UPLOAD_MAX_BYTES = 50 * 1024 * 1024; // 50 MB — matches server limit

  function buildDocHref(file) {
    return `/doc?file=${encodeURIComponent(String(file || ""))}`;
  }

  function smartTitleFromFilename(filename) {
    const raw = cleanText(String(filename || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    return raw || "Новый документ";
  }

  function guessDocTypeFromFilename(filename) {
    const value = normalizeSearchText(filename);
    const rules = [
      [/магистер/i, "Магистерская"],
      [/\bвкр\b/i, "ВКР"],
      [/диплом/i, "Дипломная"],
      [/курсов/i, "Курсовая"],
      [/контроль/i, "Контрольная"],
      [/доклад/i, "Доклад"],
      [/реферат/i, "Реферат"],
      [/эссе/i, "Эссе"],
      [/шаблон/i, "Шаблон"],
      [/ответ/i, "Ответы"],
      [/шпаргал/i, "Шпаргалка"],
    ];
    for (const [pattern, label] of rules) {
      if (pattern.test(value)) return label;
    }
    return "";
  }

  function renderUploadPreview() {
    if (!els.uploadSmartPreview) return;
    if (!state.uploadFile) {
      els.uploadSmartPreview.innerHTML =
        "<strong>Выберите файл, и здесь появится живая карточка.</strong><p>Название, категория и тип можно сразу поправить до загрузки.</p>";
      return;
    }

    const title = inputValue(els.uploadTitle) || smartTitleFromFilename(state.uploadFile.name);
    const description = inputValue(els.uploadDescription) || "Описание пока не добавлено.";
    const category = inputValue(els.uploadCategory) || "Категория не выбрана";
    const subject = inputValue(els.uploadSubject) || "Предмет не указан";
    const docType = inputValue(els.uploadDocType) || guessDocTypeFromFilename(state.uploadFile.name) || "Тип не указан";
    const tags = stringToTags(inputValue(els.uploadTags));

    els.uploadSmartPreview.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <div class="preview-meta">
        <span class="inline-pill">${escapeHtml(category)}</span>
        <span class="inline-pill">${escapeHtml(subject)}</span>
        <span class="inline-pill">${escapeHtml(docType)}</span>
        <span class="inline-pill">${escapeHtml(formatFileSize(state.uploadFile.size))}</span>
      </div>
      <p>${escapeHtml(description)}</p>
      ${
        tags.length
          ? `<div class="preview-meta">${tags.map((tag) => `<span class="inline-pill">${escapeHtml(tag)}</span>`).join("")}</div>`
          : ""
      }
    `;
  }

  function bindQuickPickGroup(container, input, values) {
    if (!container || !input) return;
    const items = values.slice(0, 6);
    container.innerHTML = items.length
      ? items
          .map(
            (value) =>
              `<button class="ghost-btn" type="button" data-fill-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`
          )
          .join("")
      : `<span class="support-text">Подсказки появятся, когда в каталоге накопятся данные.</span>`;
    container.querySelectorAll("[data-fill-value]").forEach((button) => {
      button.addEventListener("click", () => {
        input.value = button.dataset.fillValue || "";
        renderUploadPreview();
      });
    });
  }

  function renderUploadQuickPicks() {
    const fallbackDocTypes = [
      ...state.options.docTypes,
      "Реферат",
      "Курсовая",
      "Контрольная",
      "Доклад",
      "Дипломная",
      "ВКР",
    ].filter((value, index, array) => value && array.indexOf(value) === index);
    bindQuickPickGroup(els.uploadCategoryPicks, els.uploadCategory, state.options.categories);
    bindQuickPickGroup(els.uploadSubjectPicks, els.uploadSubject, state.options.subjects);
    bindQuickPickGroup(els.uploadDocTypePicks, els.uploadDocType, fallbackDocTypes);
  }

  function nextIdFromCollection(items, currentId) {
    if (!Array.isArray(items) || !items.length) return 0;
    const ids = items.map((item) => Number(item.id)).filter(Boolean);
    const index = ids.indexOf(Number(currentId));
    if (index < 0) return ids[0] || 0;
    return ids[index + 1] || ids[index - 1] || 0;
  }

  function actionableOrders() {
    return state.orders.filter((item) => !["done", "archived"].includes(item.status));
  }

  function actionableSubmissions() {
    return state.submissions.filter((item) => ["new", "priority", "delivery_failed"].includes(item.status));
  }

  async function saveOrderUpdates(orderId, updates, successMessage, options = {}) {
    const nextId = options.moveToNext ? nextIdFromCollection(actionableOrders(), orderId) : 0;
    await apiJson("/api/admin/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, updates }),
    });
    if (successMessage) showToast(successMessage);
    await refreshAll({ silent: true });
    state.selectedOrderId = nextId || orderId;
    renderOrders();
  }

  async function saveSubmissionUpdates(submissionId, updates, successMessage, options = {}) {
    const nextId = options.moveToNext ? nextIdFromCollection(actionableSubmissions(), submissionId) : 0;
    await apiJson("/api/admin/library-submissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: submissionId, updates }),
    });
    if (successMessage) showToast(successMessage);
    await refreshAll({ silent: true });
    state.selectedSubmissionId = nextId || submissionId;
    renderSubmissions();
  }

  async function publishSubmissionToCatalog(submissionId, payload) {
    const nextId = nextIdFromCollection(actionableSubmissions(), submissionId);
    const response = await apiJson("/api/admin/library-submissions/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: submissionId, ...payload }),
    });
    showToast("Работа опубликована в каталог", "success");
    state.selectedDocFile = response.doc && response.doc.file ? response.doc.file : state.selectedDocFile;
    await refreshAll({ silent: true });
    state.selectedSubmissionId = nextId || submissionId;
    togglePanel("catalog");
    renderCatalog();
    return response;
  }

  function showToast(message, kind = "info") {
    if (!els.toastStack) return;
    const toast = document.createElement("div");
    const variantClass = kind === "error"
      ? " toast--error"
      : kind === "success"
      ? " toast--success"
      : "";
    toast.className = `toast${variantClass}`;
    toast.textContent = truncate(message, 240);
    els.toastStack.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      setTimeout(() => toast.remove(), 220);
    }, 3200);
  }

  function authHeaders(extraHeaders) {
    const headers = new Headers(extraHeaders || {});
    if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
    return headers;
  }

  async function apiJson(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(path, {
        method: options.method || "GET",
        headers: authHeaders(options.headers),
        body: options.body,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error && error.name === "AbortError") {
        throw new Error("Запрос выполняется слишком долго. Попробуйте ещё раз.");
      }
      throw error;
    }
    clearTimeout(timeout);

    const text = await response.text();
    let payload = null;
    if ((response.headers.get("Content-Type") || "").includes("application/json")) {
      try {
        payload = text ? JSON.parse(text) : {};
      } catch (_error) {
        payload = null;
      }
    }

    if (!response.ok || !payload || payload.ok === false) {
      throw new Error(readErrorMessage(payload, text, response.status));
    }
    return payload;
  }

  async function apiBlob(path) {
    const response = await fetch(path, { headers: authHeaders() });
    if (!response.ok) {
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (_error) {
        payload = null;
      }
      throw new Error(readErrorMessage(payload, text, response.status));
    }

    const disposition = response.headers.get("Content-Disposition") || "";
    const filename =
      decodeURIComponent((((disposition.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || "").trim())) || "attachment";

    return {
      blob: await response.blob(),
      filename,
    };
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      showToast(successMessage || "Скопировано", "success");
      return true;
    } catch (_error) {
      showToast("Не удалось скопировать", "error");
      return false;
    }
  }

  function flashCopied(button) {
    if (!button) return;
    const original = button.dataset.originalLabel || button.textContent;
    button.dataset.originalLabel = original;
    button.classList.add("is-copied");
    if (!button.classList.contains("icon-btn")) {
      button.textContent = "Скопировано ✓";
    }
    setTimeout(() => {
      button.classList.remove("is-copied");
      if (!button.classList.contains("icon-btn")) {
        button.textContent = original;
      }
    }, 1400);
  }

  function inputValue(element) {
    return element ? cleanText(element.value) : "";
  }

  function tagsToString(tags) {
    return Array.isArray(tags) ? tags.join(", ") : "";
  }

  function stringToTags(value) {
    return String(value || "")
      .split(",")
      .map((part) => cleanText(part))
      .filter(Boolean);
  }

  function updateNavCount(element, value, isAlert) {
    if (!element) return;
    element.textContent = String(value);
    element.classList.toggle("is-alert", Boolean(isAlert));
  }

  function statusMeta(kind, status) {
    const value = cleanText(status || "new");
    if (kind === "order") {
      const map = {
        new: ["Новая", "status-pill status-pill--accent"],
        priority: ["Приоритет", "status-pill status-pill--accent"],
        in_work: ["В работе", "status-pill"],
        waiting_client: ["Ждём клиента", "status-pill"],
        done: ["Завершена", "status-pill status-pill--ok"],
        archived: ["Архив", "status-pill"],
      };
      return map[value] || [value || "—", "status-pill"];
    }

    if (kind === "submission") {
      const map = {
        new: ["Новая", "status-pill status-pill--accent"],
        priority: ["Приоритет", "status-pill status-pill--accent"],
        approved: ["Опубликована", "status-pill status-pill--ok"],
        rejected: ["Отклонена", "status-pill status-pill--danger"],
        delivery_failed: ["Сбой доставки", "status-pill status-pill--danger"],
        archived: ["Архив", "status-pill"],
      };
      return map[value] || [value || "—", "status-pill"];
    }

    if (kind === "job") {
      const map = {
        pending: ["Ожидает", "status-pill status-pill--accent"],
        processing: ["В работе", "status-pill"],
        failed: ["Ошибка", "status-pill status-pill--danger"],
        done: ["Готово", "status-pill status-pill--ok"],
      };
      return map[value] || [value || "—", "status-pill"];
    }

    const ok = Boolean(status);
    return [ok ? "ОК" : "Нет", ok ? "status-pill status-pill--ok" : "status-pill status-pill--danger"];
  }

  function calcDocScore(doc) {
    const analytics = state.analytics || {};
    const topViewed = analytics.topViewed || [];
    const topDownloaded = analytics.topDownloaded || [];
    const viewRow = topViewed.find((item) => item.file === doc.file);
    const downloadRow = topDownloaded.find((item) => item.file === doc.file);
    return Number((viewRow && viewRow.views) || 0) * 2 + Number((downloadRow && downloadRow.downloads) || 0) * 3;
  }

  function collectOptions() {
    const categories = [];
    const subjects = [];
    const courses = [];
    const docTypes = [];
    [...state.docs, ...state.submissions].forEach((item) => {
      const category = cleanText(item.category);
      const subject = cleanText(item.subject);
      const course = cleanText(item.course);
      const docType = cleanText(item.docType || item.doc_type);
      if (category && !categories.includes(category)) categories.push(category);
      if (subject && !subjects.includes(subject)) subjects.push(subject);
      if (course && !courses.includes(course)) courses.push(course);
      if (docType && !docTypes.includes(docType)) docTypes.push(docType);
    });
    categories.sort((a, b) => a.localeCompare(b, "ru"));
    subjects.sort((a, b) => a.localeCompare(b, "ru"));
    courses.sort((a, b) => a.localeCompare(b, "ru"));
    docTypes.sort((a, b) => a.localeCompare(b, "ru"));
    state.options = { categories, subjects, courses, docTypes };

    if (els.categoryOptions) {
      els.categoryOptions.innerHTML = categories.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
    }
    if (els.subjectOptions) {
      els.subjectOptions.innerHTML = subjects.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
    }
    if (els.courseOptions) {
      els.courseOptions.innerHTML = courses.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
    }
    if (els.docTypeOptions) {
      els.docTypeOptions.innerHTML = docTypes.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
    }

    if (els.orderStatus) {
      els.orderStatus.innerHTML = ORDER_STATUS_OPTIONS.map(
        ([value, label]) => `<option value="${value}">${label}</option>`
      ).join("");
    }

    renderUploadQuickPicks();
  }

  function setHeaderForTab(tab) {
    const meta = TAB_META[tab] || TAB_META.overview;
    if (els.workspaceEyebrow) els.workspaceEyebrow.textContent = meta.eyebrow;
    if (els.workspaceTitle) els.workspaceTitle.textContent = meta.title;
    if (els.workspaceLead) els.workspaceLead.textContent = meta.lead;
  }

  function setLoggedOutState() {
    state.token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    if (els.sessionState) els.sessionState.textContent = "Не авторизованы";
    if (els.authCard) els.authCard.hidden = false;
    if (els.workspace) els.workspace.hidden = true;
    if (els.refreshBtn) els.refreshBtn.hidden = true;
    if (els.logoutBtn) els.logoutBtn.hidden = true;
    if (els.lastSync) { els.lastSync.textContent = "Ещё не обновляли"; els.lastSync.hidden = true; }
    if (els.loginError) els.loginError.textContent = "";
    stopAutoRefresh();
  }

  function setLoggedInState() {
    if (els.sessionState) els.sessionState.textContent = "Доступ открыт";
    if (els.authCard) els.authCard.hidden = true;
    if (els.workspace) els.workspace.hidden = false;
    if (els.refreshBtn) els.refreshBtn.hidden = false;
    if (els.logoutBtn) els.logoutBtn.hidden = false;
    if (els.lastSync) { els.lastSync.textContent = formatClientDate(state.lastSyncAt); els.lastSync.hidden = false; }
    startAutoRefresh();
  }

  // Auto-sync every 60s while the tab is focused and the session is live.
  // Replaces the manual "Обновить" button which was removed in the simplify pass.
  var autoRefreshTimer = null;
  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(() => {
      if (!state.token) return;
      if (document.hidden) return;
      refreshAll().catch(() => {});
    }, 60000);
  }
  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  function togglePanel(tab) {
    state.activeTab = TAB_META[tab] ? tab : "overview";
    sessionStorage.setItem(ACTIVE_TAB_KEY, state.activeTab);
    setHeaderForTab(state.activeTab);

    els.tabs.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      const active = panel.dataset.panel === state.activeTab;
      panel.hidden = !active;
    });

    if (state.activeTab === "upload") {
      // Wizard defaults to step 1 every time the tab is opened unless user
      // is already past it (file is loaded and they're on 2 or 3).
      if (typeof goToUploadStep === "function") {
        const activePane = document.querySelector('.wizard-pane:not([hidden])');
        if (!activePane) goToUploadStep(1);
        else syncWizardState();
      }
    }

    const activePanel = document.querySelector(`.panel[data-panel="${state.activeTab}"]`);
    revealOnCompactLayout(activePanel);
  }

  function applyBootstrap(payload) {
    state.docs = Array.isArray(payload.docs) ? payload.docs : [];
    state.orders = Array.isArray(payload.orders) ? payload.orders : [];
    state.submissions = Array.isArray(payload.submissions) ? payload.submissions : [];
    state.analytics = payload.analytics || {};
    state.outbox = payload.outbox || {};
    state.health = payload.health || {};
    state.lastSyncAt = Date.now();

    if (!state.docs.find((item) => item.file === state.selectedDocFile)) {
      state.selectedDocFile = state.docs[0] ? state.docs[0].file : "";
    }
    if (!state.orders.find((item) => Number(item.id) === Number(state.selectedOrderId))) {
      state.selectedOrderId = state.orders[0] ? Number(state.orders[0].id) : 0;
    }
    if (!state.submissions.find((item) => Number(item.id) === Number(state.selectedSubmissionId))) {
      state.selectedSubmissionId = state.submissions[0] ? Number(state.submissions[0].id) : 0;
    }
  }

  function renderNavCounts() {
    const activeOrders = state.orders.filter((item) => !["done", "archived"].includes(item.status)).length;
    const pendingSubmissions = state.submissions.filter((item) => ["new", "priority"].includes(item.status)).length;
    const failedJobs = Number((((state.outbox || {}).counts || {}).failed) || 0);
    const warnings = Array.isArray((state.health || {}).warnings) ? state.health.warnings.length : 0;

    updateNavCount(els.navCountOverview, warnings || "•", warnings > 0);
    updateNavCount(els.navCountCatalog, state.docs.length, false);
    updateNavCount(els.navCountSubmissions, pendingSubmissions, pendingSubmissions > 0);
    updateNavCount(els.navCountOrders, activeOrders, activeOrders > 0);
    // Keep failedJobs + warnings in state for future delivery tab; no UI yet
    void failedJobs;
  }

  function renderOverview() {
    const pendingSubmissions = state.submissions.filter((item) => ["new", "priority"].includes(item.status)).length;
    const activeOrders = state.orders.filter((item) => !["done", "archived"].includes(item.status)).length;
    const totalDownloads = Number((state.analytics || {}).totalDownloads || 0);
    const weekDownloads = Number((state.analytics || {}).weekDownloads || 0);

    /* ── Hero: 4 big number tiles ── */
    if (els.overviewHeroTiles) {
      const tiles = [
        { label: "В каталоге", value: state.docs.length, note: "опубликованных работ" },
        { label: "Заявки",      value: activeOrders,      note: "ждут ответа",       warn: activeOrders > 0 },
        { label: "Входящие",    value: pendingSubmissions, note: "новых работ",       warn: pendingSubmissions > 0 },
        { label: "За неделю",   value: weekDownloads || totalDownloads, note: weekDownloads ? "скачиваний за 7 дней" : "всего скачиваний" },
      ];
      els.overviewHeroTiles.innerHTML = tiles.map((t) => (
        `<div class="hero-tile${t.warn ? ' is-warn' : ''}">` +
          `<span class="hero-tile-label">${escapeHtml(t.label)}</span>` +
          `<span class="hero-tile-value">${escapeHtml(String(t.value))}</span>` +
          `<span class="hero-tile-note">${escapeHtml(t.note)}</span>` +
        `</div>`
      )).join("");
    }

    /* ── Action-card counts (strong numbers inside the big cards) ── */
    if (els.actionCardOrders) els.actionCardOrders.textContent = activeOrders ? String(activeOrders) : 'Нет новых';
    if (els.actionCardSubmissions) els.actionCardSubmissions.textContent = pendingSubmissions ? String(pendingSubmissions) : 'Пусто';

    /* ── "Требует внимания" ── top 4 real items (oldest unanswered orders + submissions) ── */
    if (els.overviewAttention) {
      const items = [];

      /* Unanswered orders, oldest first */
      const freshOrders = state.orders
        .filter((o) => ["new", "priority"].includes(o.status))
        .slice(0, 3);
      freshOrders.forEach((order) => {
        items.push({
          tab: "orders",
          id: order.id,
          kind: "order",
          title: order.topic || "Заявка без темы",
          meta: order.contact || "контакт не указан",
        });
      });

      /* Fresh submissions */
      const freshSubs = state.submissions
        .filter((s) => s.status === "new" || s.status === "priority")
        .slice(0, 3);
      freshSubs.forEach((sub) => {
        items.push({
          tab: "submissions",
          id: sub.id,
          kind: "submission",
          title: sub.title || "Работа без названия",
          meta: sub.contact || "без контакта",
        });
      });

      if (els.overviewAttentionCount) {
        els.overviewAttentionCount.textContent = items.length
          ? items.length + ' ' + pluralize(items.length, ['дело', 'дела', 'дел'])
          : 'всё чисто';
      }

      els.overviewAttention.innerHTML = items.length
        ? items.map((it) => (
            `<button class="overview-item" type="button" data-open-${it.kind}="${it.id}">` +
              `<strong>${escapeHtml(it.title)}</strong>` +
              `<span>${escapeHtml(it.meta)}</span>` +
            `</button>`
          )).join("")
        : `<div class="overview-item empty">Срочных дел нет. Можно спокойно писать.</div>`;
      bindSummaryActions(els.overviewAttention);
    }

    /* ── Recent orders (right column) ── */
    if (els.overviewRecentOrders) {
      const orders = state.orders.slice(0, 5);
      els.overviewRecentOrders.innerHTML = orders.length
        ? orders.map((order) => {
            const [label] = statusMeta("order", order.status);
            return (
              `<button class="overview-item" type="button" data-open-order="${order.id}">` +
                `<strong>${escapeHtml(order.topic || "Без темы")}</strong>` +
                `<span>${escapeHtml(order.contact || "контакт не указан")} · ${escapeHtml(label)}</span>` +
              `</button>`
            );
          }).join("")
        : `<div class="overview-item empty">Новых заявок пока нет.</div>`;
      bindSummaryActions(els.overviewRecentOrders);
    }
  }

  function renderCatalogQueueBar() {
    if (!els.catalogQueueBar) return;
    const quick = els.catalogQuickFilter ? els.catalogQuickFilter.value : "all";
    const popularCount = state.docs.filter((doc) => calcDocScore(doc) > 0).length;
    els.catalogQueueBar.innerHTML = `
      <button class="queue-chip${quick === "all" ? " is-active" : ""}" type="button" data-catalog-filter="all">Все <strong>${state.docs.length}</strong></button>
      <button class="queue-chip${quick === "recent" ? " is-active" : ""}" type="button" data-catalog-filter="recent">Свежие</button>
      <button class="queue-chip${quick === "popular" ? " is-active" : ""}" type="button" data-catalog-filter="popular">Популярные <strong>${popularCount}</strong></button>
    `;
    els.catalogQueueBar.querySelectorAll("[data-catalog-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        if (els.catalogQuickFilter) els.catalogQuickFilter.value = button.dataset.catalogFilter || "all";
        renderCatalog();
      });
    });
  }

  function renderOrderQueueBar() {
    if (!els.orderQueueBar) return;
    const active = actionableOrders();
    const nextId = nextIdFromCollection(active, state.selectedOrderId);
    const newCount = state.orders.filter((item) => item.status === "new").length;
    const priorityCount = state.orders.filter((item) => item.status === "priority").length;
    const filter = els.orderStatusFilter ? els.orderStatusFilter.value : "all";
    els.orderQueueBar.innerHTML = `
      <button class="queue-chip${filter === "all" ? " is-active" : ""}" type="button" data-order-filter="all">Активные <strong>${active.length}</strong></button>
      <button class="queue-chip${filter === "new" ? " is-active" : ""}" type="button" data-order-filter="new">Новые <strong>${newCount}</strong></button>
      <button class="queue-chip${filter === "priority" ? " is-active" : ""}" type="button" data-order-filter="priority">Приоритет <strong>${priorityCount}</strong></button>
      <button class="queue-chip" type="button" data-next-order${nextId ? "" : " disabled"}>Следующая заявка</button>
    `;
    els.orderQueueBar.querySelectorAll("[data-order-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        if (els.orderStatusFilter) els.orderStatusFilter.value = button.dataset.orderFilter || "all";
        renderOrders();
      });
    });
    const nextButton = els.orderQueueBar.querySelector("[data-next-order]");
    if (nextButton) {
      nextButton.addEventListener("click", () => {
        if (nextId) jumpToOrder(nextId);
      });
    }
  }

  function renderSubmissionQueueBar() {
    if (!els.submissionQueueBar) return;
    const actionable = actionableSubmissions();
    const nextId = nextIdFromCollection(actionable, state.selectedSubmissionId);
    const newCount = state.submissions.filter((item) => item.status === "new").length;
    const priorityCount = state.submissions.filter((item) => item.status === "priority").length;
    const filter = els.submissionStatusFilter ? els.submissionStatusFilter.value : "all";
    els.submissionQueueBar.innerHTML = `
      <button class="queue-chip${filter === "all" ? " is-active" : ""}" type="button" data-submission-filter="all">К разбору <strong>${actionable.length}</strong></button>
      <button class="queue-chip${filter === "new" ? " is-active" : ""}" type="button" data-submission-filter="new">Новые <strong>${newCount}</strong></button>
      <button class="queue-chip${filter === "priority" ? " is-active" : ""}" type="button" data-submission-filter="priority">Приоритет <strong>${priorityCount}</strong></button>
      <button class="queue-chip" type="button" data-next-submission${nextId ? "" : " disabled"}>Следующая работа</button>
    `;
    els.submissionQueueBar.querySelectorAll("[data-submission-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        if (els.submissionStatusFilter) els.submissionStatusFilter.value = button.dataset.submissionFilter || "all";
        renderSubmissions();
      });
    });
    const nextButton = els.submissionQueueBar.querySelector("[data-next-submission]");
    if (nextButton) {
      nextButton.addEventListener("click", () => {
        if (nextId) jumpToSubmission(nextId);
      });
    }
  }

  function filteredCatalogDocs() {
    const search = inputValue(els.catalogSearch).toLowerCase();
    const quick = els.catalogQuickFilter ? els.catalogQuickFilter.value : "all";
    let docs = [...state.docs];

    if (quick === "recent") {
      docs = docs.slice().reverse();
    } else if (quick === "popular") {
      docs = docs
        .filter((doc) => calcDocScore(doc) > 0)
        .sort((a, b) => calcDocScore(b) - calcDocScore(a));
    }

    if (!search) return docs;
    return docs.filter((doc) =>
      [doc.catalogTitle, doc.title, doc.subject, doc.category, doc.filename]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }

  function renderCatalog() {
    if (!els.catalogList) return;
    renderCatalogQueueBar();
    const docs = filteredCatalogDocs();
    els.catalogList.innerHTML = docs.length
      ? docs
          .map((doc) => {
            const active = doc.file === state.selectedDocFile;
            const score = calcDocScore(doc);
            return `<button class="row-card${active ? " is-active" : ""}" type="button" data-doc-file="${escapeHtml(
              doc.file
            )}" aria-pressed="${active ? "true" : "false"}"><div class="row-top"><div><div class="row-title">${escapeHtml(
              doc.catalogTitle || doc.title || doc.filename || "Документ"
            )}</div><div class="row-subtitle">${escapeHtml(doc.category || "Без категории")} · ${escapeHtml(
              doc.subject || "Без предмета"
            )}</div></div><span class="inline-pill">${escapeHtml(doc.size || "—")}</span></div><p class="row-meta">${
              score ? `Популярность: ${score} · ` : ""
            }${escapeHtml(doc.file || "")}</p></button>`;
          })
          .join("")
      : `<div class="empty-state">Ничего не нашлось. Очистите поиск или выберите «Все документы».</div>`;

    els.catalogList.querySelectorAll("[data-doc-file]").forEach((card) => {
      card.addEventListener("click", () => {
        state.selectedDocFile = card.dataset.docFile || "";
        renderCatalog();
        renderCatalogEditor();
        revealOnCompactLayout(els.catalogEditor && !els.catalogEditor.hidden ? els.catalogEditor : els.catalogEmpty);
      });
    });

    if (!state.selectedDocFile && docs[0]) state.selectedDocFile = docs[0].file;
    renderCatalogEditor();
  }

  function renderCatalogEditor() {
    const doc = state.docs.find((item) => item.file === state.selectedDocFile);
    if (!doc) {
      if (els.catalogEmpty) els.catalogEmpty.hidden = false;
      if (els.catalogEditor) els.catalogEditor.hidden = true;
      if (els.catalogStatus) els.catalogStatus.textContent = "";
      return;
    }

    if (els.catalogEmpty) els.catalogEmpty.hidden = true;
    if (els.catalogEditor) els.catalogEditor.hidden = false;

    if (els.catalogTitle) els.catalogTitle.value = doc.catalogTitle || doc.title || "";
    if (els.catalogDescription) els.catalogDescription.value = doc.catalogDescription || doc.description || "";
    if (els.catalogCategory) els.catalogCategory.value = doc.category || "";
    if (els.catalogSubject) els.catalogSubject.value = doc.subject || "";
    if (els.catalogCourse) els.catalogCourse.value = doc.course || "";
    if (els.catalogDocType) els.catalogDocType.value = doc.docType || "";
    if (els.catalogTags) els.catalogTags.value = tagsToString(doc.tags);
    if (els.catalogMeta) {
      els.catalogMeta.innerHTML = `
        Файл: ${escapeHtml(doc.file)}<br />
        Размер: ${escapeHtml(doc.size || "—")}<br />
        Публичная ссылка: <a href="${buildDocHref(doc.file)}" target="_blank" rel="noopener">${escapeHtml(buildDocHref(doc.file))}</a>
        <div class="detail-actions" style="margin-top:10px">
          <button class="ghost-btn" type="button" data-copy-text="${escapeHtml(buildDocHref(doc.file))}">Скопировать ссылку</button>
        </div>
      `;
      bindCopyButtons(els.catalogMeta);
    }
    if (els.catalogOpenBtn) els.catalogOpenBtn.href = buildDocHref(doc.file);
  }

  function filteredOrders() {
    const search = inputValue(els.orderSearch).toLowerCase();
    const statusFilter = els.orderStatusFilter ? els.orderStatusFilter.value : "all";
    return state.orders.filter((order) => {
      if (statusFilter === "open") {
        if (order.status === "done" || order.status === "archived") return false;
      } else if (statusFilter !== "all" && order.status !== statusFilter) {
        return false;
      }
      if (!search) return true;
      return [order.topic, order.contact, order.subject, order.work_type, order.comment]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }

  // ═══ ORDERS — contact-first helpers (pilot redesign) ═══

  function orderChannel(order) {
    if (!order) return "unknown";
    const explicit = (order.contact_channel || "").toLowerCase();
    if (explicit) return explicit;
    const raw = (order.contact || "").trim();
    if (!raw) return "unknown";
    if (/t\.me\/|^@[\w_]+$/i.test(raw)) return "telegram";
    if (/vk\.com\/|^vk:|vkontakte/i.test(raw)) return "vk";
    if (/@[\w.+-]+\.[a-z]{2,}$/i.test(raw)) return "email";
    if (/^\+?\d[\d\s()-]{6,}$/.test(raw)) return "phone";
    return "other";
  }

  function channelIcon(order) {
    const ch = orderChannel(order);
    if (ch === "telegram") return "✈";
    if (ch === "vk")       return "ВК";
    if (ch === "email")    return "✉";
    if (ch === "phone")    return "☎";
    return "·";
  }

  function channelLabel(order) {
    const ch = orderChannel(order);
    if (ch === "telegram") return "Telegram";
    if (ch === "vk")       return "ВКонтакте";
    if (ch === "email")    return "Email";
    if (ch === "phone")    return "Телефон";
    return "Контакт";
  }

  function prettyContact(order) {
    const raw = (order && order.contact) ? String(order.contact).trim() : "";
    if (!raw) return "Контакт не указан";
    // Strip telegram protocols for display
    return raw.replace(/^https?:\/\/(t\.me|vk\.com)\//i, "$1/");
  }

  function priceLabel(order) {
    const n = Number(order && order.estimated_price);
    if (!n || isNaN(n)) return "";
    return n.toLocaleString("ru-RU") + " ₽";
  }

  function workTypeLabel(order) {
    return (order && order.work_type) ? String(order.work_type) : "Тип не выбран";
  }

  function clientHistoryFor(order) {
    if (!order || !order.contact) return [];
    const key = String(order.contact).trim().toLowerCase();
    if (!key) return [];
    return state.orders
      .filter((o) => o && Number(o.id) !== Number(order.id))
      .filter((o) => String(o.contact || "").trim().toLowerCase() === key);
  }

  var ORDER_STATUS_PILLS = [
    { value: "new",            label: "Новые",       short: "Новая" },
    { value: "priority",       label: "Приоритет",   short: "Приоритет" },
    { value: "in_work",        label: "В работе",    short: "В работе" },
    { value: "waiting_client", label: "Ждём",        short: "Ждём клиента" },
    { value: "done",           label: "Готово",      short: "Готово" },
    { value: "archived",       label: "Архив",       short: "Архив" }
  ];

  function renderOrderFilterPills() {
    if (!els.orderStatusPills) return;
    const current = els.orderStatusFilter ? els.orderStatusFilter.value : "all";
    const countBy = {};
    state.orders.forEach((o) => { const s = o.status || "new"; countBy[s] = (countBy[s] || 0) + 1; });
    const totalOpen = state.orders.filter((o) => !["done", "archived"].includes(o.status)).length;
    const allCount = state.orders.length;
    const parts = [];
    parts.push(
      `<button class="filter-chip${current === "all" ? " is-active" : ""}" type="button" data-status-filter="all">` +
      `Все<span class="filter-chip-count">${allCount}</span></button>`
    );
    parts.push(
      `<button class="filter-chip${current === "open" ? " is-active" : ""}" type="button" data-status-filter="open">` +
      `Открытые<span class="filter-chip-count">${totalOpen}</span></button>`
    );
    ORDER_STATUS_PILLS.forEach((opt) => {
      const n = countBy[opt.value] || 0;
      parts.push(
        `<button class="filter-chip filter-chip--${opt.value}${current === opt.value ? " is-active" : ""}" type="button" data-status-filter="${opt.value}">` +
        `${escapeHtml(opt.label)}<span class="filter-chip-count">${n}</span></button>`
      );
    });
    els.orderStatusPills.innerHTML = parts.join("");
    els.orderStatusPills.querySelectorAll("[data-status-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.statusFilter || "all";
        if (els.orderStatusFilter) els.orderStatusFilter.value = (val === "open" ? "open" : val);
        renderOrders();
      });
    });
  }

  function renderOrders() {
    if (!els.orderList) return;
    renderOrderQueueBar();
    renderOrderFilterPills();
    const orders = filteredOrders();
    els.orderList.innerHTML = orders.length
      ? orders
          .map((order) => {
            const active = Number(order.id) === Number(state.selectedOrderId);
            const [statusLabel, statusKlass] = statusMeta("order", order.status);
            const dotKlass = "status-dot status-dot--" + (order.status || "new");
            const ch = orderChannel(order);
            const icon = channelIcon(order);
            const contact = prettyContact(order);
            const type = workTypeLabel(order);
            const price = priceLabel(order);
            const metaParts = [type];
            if (price) metaParts.push(price);
            if (order.deadline) metaParts.push(escapeHtml(String(order.deadline)));
            metaParts.push(formatShortDate(order.created_at));
            return `<button class="row-card row-card--order${active ? " is-active" : ""}" type="button" data-order-id="${order.id}" aria-pressed="${
              active ? "true" : "false"
            }" title="${escapeHtml(statusLabel)}">` +
              `<div class="row-order-top">` +
                `<span class="channel-chip channel-chip--${ch}" aria-hidden="true">${icon}</span>` +
                `<span class="row-contact">${escapeHtml(contact)}</span>` +
                `<span class="${dotKlass}" aria-label="${escapeHtml(statusLabel)}"></span>` +
              `</div>` +
              `<div class="row-order-meta">${metaParts.map(escapeHtml).join(" · ")}</div>` +
              (order.topic && order.topic.trim() && order.topic.trim() !== "Без темы"
                ? `<div class="row-order-topic">${escapeHtml(order.topic)}</div>`
                : "") +
            `</button>`;
          })
          .join("")
      : `<div class="empty-state">По этому фильтру заявок нет. Переключитесь на «Все» или очистите поиск.</div>`;

    els.orderList.querySelectorAll("[data-order-id]").forEach((card) => {
      card.addEventListener("click", () => {
        state.selectedOrderId = Number(card.dataset.orderId || 0);
        renderOrders();
        renderOrderEditor();
        revealOnCompactLayout(els.orderEditor && !els.orderEditor.hidden ? els.orderEditor : els.orderEmpty);
      });
    });

    if (!state.selectedOrderId && orders[0]) state.selectedOrderId = Number(orders[0].id);
    renderOrderEditor();
  }

  function renderOrderDetailStatusPills(order) {
    if (!els.orderStatusPillsDetail) return;
    const parts = ORDER_STATUS_PILLS.map((opt) =>
      `<button class="filter-chip filter-chip--${opt.value}${order.status === opt.value ? " is-active" : ""}" type="button" data-order-quick-status="${opt.value}">${escapeHtml(opt.short)}</button>`
    );
    els.orderStatusPillsDetail.innerHTML = parts.join("");
    els.orderStatusPillsDetail.querySelectorAll("[data-order-quick-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const status = button.dataset.orderQuickStatus || "new";
        try {
          await withButtonBusy(button, "…", async () => {
            await saveOrderUpdates(
              order.id,
              { status, manager_note: inputValue(els.orderNote) },
              "Статус обновлён",
              { moveToNext: status === "done" }
            );
          });
        } catch (error) {
          showToast(error.message || "Не удалось обновить заявку", "error");
        }
      });
    });
  }

  function renderClientHistoryBlock(order) {
    if (!els.orderClientHistory) return;
    const history = clientHistoryFor(order);
    if (!history.length) {
      els.orderClientHistory.hidden = true;
      els.orderClientHistory.innerHTML = "";
      return;
    }
    els.orderClientHistory.hidden = false;
    const word = pluralize(history.length, ['предыдущая заявка', 'предыдущие заявки', 'предыдущих заявок']);
    const items = history
      .slice(0, 5)
      .map((h) => {
        const [label, klass] = statusMeta("order", h.status);
        const dotKlass = "status-dot status-dot--" + (h.status || "new");
        const typeStr = h.work_type || "заявка";
        const price = priceLabel(h);
        const tail = price ? (typeStr + " · " + price) : typeStr;
        return `<button class="client-history-item" type="button" data-jump-order="${h.id}">` +
          `<span class="${dotKlass}" aria-label="${escapeHtml(label)}"></span>` +
          `<span class="client-history-type">${escapeHtml(tail)}</span>` +
          `<span class="client-history-date">${escapeHtml(formatShortDate(h.created_at))}</span>` +
          `</button>`;
      }).join("");
    const more = history.length > 5 ? `<div class="client-history-more">+ ещё ${history.length - 5}</div>` : "";
    els.orderClientHistory.innerHTML =
      `<div class="client-history-head">${history.length} ${word} от этого контакта</div>` +
      `<div class="client-history-list">${items}${more}</div>`;
    els.orderClientHistory.querySelectorAll("[data-jump-order]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = Number(btn.dataset.jumpOrder || 0);
        if (targetId) jumpToOrder(targetId);
      });
    });
  }

  function renderOrderContext(order) {
    if (!els.orderContext) return;
    const chips = [];
    if (order.subject)       chips.push(["Предмет",   order.subject]);
    if (order.pages)         chips.push(["Страниц",   String(order.pages)]);
    if (order.originality)   chips.push(["Оригинальность", order.originality]);
    if (order.deadline)      chips.push(["Срок",      order.deadline]);
    const price = priceLabel(order);
    if (price)               chips.push(["Оценка",    price]);

    const sourceParts = [];
    if (order.source_label)  sourceParts.push(order.source_label);
    else if (order.source)   sourceParts.push(order.source);
    if (order.sample_title)  sourceParts.push("смотрел: «" + order.sample_title + "»");
    if (order.entry_url && !sourceParts.length) sourceParts.push(order.entry_url);
    const sourceLine = sourceParts.length
      ? `<div class="order-context-source">Пришёл: ${escapeHtml(sourceParts.join(" · "))}</div>`
      : "";

    const commentHtml = (order.comment && String(order.comment).trim())
      ? `<div class="order-context-comment"><span class="order-context-kicker">Сообщение клиента</span><p>${escapeHtml(String(order.comment))}</p></div>`
      : "";

    const chipsHtml = chips.length
      ? `<div class="order-context-chips">` +
        chips.map(([k, v]) => `<span class="order-chip"><span class="order-chip-k">${escapeHtml(k)}</span><span class="order-chip-v">${escapeHtml(String(v))}</span></span>`).join("") +
        `</div>`
      : "";

    const topicHtml = (order.topic && order.topic.trim() && order.topic.trim() !== "Без темы")
      ? `<h4 class="order-context-topic">${escapeHtml(order.topic)}</h4>`
      : "";

    const html = topicHtml + sourceLine + commentHtml + chipsHtml;
    if (!html) { els.orderContext.hidden = true; els.orderContext.innerHTML = ""; return; }
    els.orderContext.hidden = false;
    els.orderContext.innerHTML = html;
  }

  function renderOrderSummary(order) {
    if (!els.orderSummary) return;
    const nextId = nextIdFromCollection(actionableOrders(), order.id);
    const ch = orderChannel(order);
    const icon = channelIcon(order);
    const chLabel = channelLabel(order);
    const contact = prettyContact(order);
    const [statusLabel, statusKlass] = statusMeta("order", order.status);
    els.orderSummary.innerHTML =
      `<div class="contact-hero">` +
        `<span class="channel-chip channel-chip--${ch} channel-chip--lg" title="${escapeHtml(chLabel)}" aria-hidden="true">${icon}</span>` +
        `<div class="contact-hero-body">` +
          `<div class="contact-hero-value">${escapeHtml(contact)}</div>` +
          `<div class="contact-hero-meta"><span class="${statusKlass}">${escapeHtml(statusLabel)}</span> · ${escapeHtml(chLabel)} · ${escapeHtml(formatDate(order.created_at))}</div>` +
        `</div>` +
        `<div class="contact-hero-actions">` +
          `<button class="icon-btn" type="button" data-copy-text="${escapeHtml(order.contact || "")}" title="Скопировать контакт" aria-label="Скопировать контакт">⧉</button>` +
          `<button class="icon-btn" type="button" data-next-order-inline${nextId ? "" : " disabled"} title="Следующая заявка (J)" aria-label="Следующая заявка">→</button>` +
        `</div>` +
      `</div>`;
    bindCopyButtons(els.orderSummary);
    const nextBtn = els.orderSummary.querySelector("[data-next-order-inline]");
    if (nextBtn) nextBtn.addEventListener("click", () => { if (nextId) jumpToOrder(nextId); });
  }

  function renderOrderEditor() {
    const order = state.orders.find((item) => Number(item.id) === Number(state.selectedOrderId));
    if (!order) {
      if (els.orderEmpty) els.orderEmpty.hidden = false;
      if (els.orderEditor) els.orderEditor.hidden = true;
      if (els.orderStatusNote) els.orderStatusNote.textContent = "";
      return;
    }

    if (els.orderEmpty) els.orderEmpty.hidden = true;
    if (els.orderEditor) els.orderEditor.hidden = false;

    const attachments = Array.isArray(order.attachments) ? order.attachments : [];

    renderOrderSummary(order);
    renderClientHistoryBlock(order);
    renderOrderContext(order);
    renderOrderDetailStatusPills(order);

    if (els.orderStatus) els.orderStatus.value = order.status || "new";
    if (els.orderNote) els.orderNote.value = order.manager_note || "";
    if (els.orderNoteHint) {
      els.orderNoteHint.textContent = (order.manager_note && order.manager_note.trim())
        ? (order.manager_note.length > 40 ? order.manager_note.slice(0, 40) + "…" : order.manager_note)
        : "пусто";
    }
    if (els.orderResponseHint) {
      if (order.response_to_client && order.response_at) {
        els.orderResponseHint.textContent = "отправлено " + formatShortDate(order.response_at);
      } else if (order.response_to_client) {
        els.orderResponseHint.textContent = "черновик";
      } else {
        els.orderResponseHint.textContent = "не отправлялся";
      }
    }
    if (els.orderFilesBlock) {
      els.orderFilesBlock.hidden = !attachments.length;
    }
    if (els.orderFilesHint) {
      els.orderFilesHint.textContent = attachments.length
        ? (attachments.length + " " + pluralize(attachments.length, ['файл', 'файла', 'файлов']))
        : "—";
    }
    if (els.orderAttachments) {
      els.orderAttachments.innerHTML = attachments.length
        ? attachments
            .map(
              (attachment) =>
                `<button class="ghost-btn" type="button" data-download-kind="order" data-owner-id="${order.id}" data-stored-name="${escapeHtml(
                  attachment.stored_name || ""
                )}" data-download-name="${escapeHtml(attachment.name || attachment.stored_name || "Файл")}">${escapeHtml(
                  attachment.name || attachment.stored_name || "Файл"
                )} · ${escapeHtml(attachment.size_label || formatFileSize(attachment.size_bytes))}</button>`
            )
            .join("")
        : "";
      bindAttachmentDownloads(els.orderAttachments);
    }
  }

  function filteredSubmissions() {
    const search = inputValue(els.submissionSearch).toLowerCase();
    const statusFilter = els.submissionStatusFilter ? els.submissionStatusFilter.value : "all";
    return state.submissions.filter((submission) => {
      if (statusFilter === "open") {
        if (["approved", "rejected", "archived"].includes(submission.status)) return false;
      } else if (statusFilter !== "all" && submission.status !== statusFilter) {
        return false;
      }
      if (!search) return true;
      return [submission.title, submission.contact, submission.subject, submission.category, submission.author_name, submission.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }

  var SUBMISSION_STATUS_PILLS = [
    { value: "new",              short: "Новая",       label: "Новые" },
    { value: "priority",         short: "Приоритет",   label: "Приоритет" },
    { value: "approved",         short: "Опубликована", label: "Опубликованы" },
    { value: "rejected",         short: "Отклонена",   label: "Отклонены" },
    { value: "delivery_failed",  short: "Сбой",        label: "Сбой" },
    { value: "archived",         short: "Архив",       label: "Архив" }
  ];

  function submissionContactField(submission) {
    if (!submission) return "";
    return submission.contact || submission.author_name || "";
  }

  function submissionChannelIcon(submission) {
    const ch = orderChannel({ contact: submissionContactField(submission), contact_channel: submission && submission.contact_channel });
    return {
      icon: channelIcon({ contact: submissionContactField(submission), contact_channel: submission && submission.contact_channel }),
      channel: ch,
      label: channelLabel({ contact: submissionContactField(submission), contact_channel: submission && submission.contact_channel })
    };
  }

  function clientHistoryForSubmission(submission) {
    if (!submission) return [];
    const key = String(submissionContactField(submission)).trim().toLowerCase();
    if (!key) return [];
    return state.submissions
      .filter((s) => s && Number(s.id) !== Number(submission.id))
      .filter((s) => String(submissionContactField(s)).trim().toLowerCase() === key);
  }

  function renderSubmissionFilterPills() {
    if (!els.submissionStatusPills) return;
    const current = els.submissionStatusFilter ? els.submissionStatusFilter.value : "all";
    const countBy = {};
    state.submissions.forEach((s) => { const v = s.status || "new"; countBy[v] = (countBy[v] || 0) + 1; });
    const totalOpen = state.submissions.filter((s) => !["approved", "rejected", "archived"].includes(s.status)).length;
    const allCount = state.submissions.length;
    const parts = [];
    parts.push(
      `<button class="filter-chip${current === "all" ? " is-active" : ""}" type="button" data-submission-filter="all">` +
      `Все<span class="filter-chip-count">${allCount}</span></button>`
    );
    parts.push(
      `<button class="filter-chip${current === "open" ? " is-active" : ""}" type="button" data-submission-filter="open">` +
      `Открытые<span class="filter-chip-count">${totalOpen}</span></button>`
    );
    SUBMISSION_STATUS_PILLS.forEach((opt) => {
      const n = countBy[opt.value] || 0;
      parts.push(
        `<button class="filter-chip filter-chip--${opt.value}${current === opt.value ? " is-active" : ""}" type="button" data-submission-filter="${opt.value}">` +
        `${escapeHtml(opt.label)}<span class="filter-chip-count">${n}</span></button>`
      );
    });
    els.submissionStatusPills.innerHTML = parts.join("");
    els.submissionStatusPills.querySelectorAll("[data-submission-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.submissionFilter || "all";
        if (els.submissionStatusFilter) els.submissionStatusFilter.value = val;
        renderSubmissions();
      });
    });
  }

  function renderSubmissions() {
    if (!els.submissionList) return;
    renderSubmissionQueueBar();
    renderSubmissionFilterPills();
    const submissions = filteredSubmissions();
    els.submissionList.innerHTML = submissions.length
      ? submissions
          .map((submission) => {
            const active = Number(submission.id) === Number(state.selectedSubmissionId);
            const [statusLabel] = statusMeta("submission", submission.status);
            const dotKlass = "status-dot status-dot--" + (submission.status || "new");
            const chInfo = submissionChannelIcon(submission);
            const contact = submission.contact || submission.author_name || "Автор не указан";
            const attachmentCount = Array.isArray(submission.attachments) ? submission.attachments.length : 0;
            const metaParts = [];
            if (submission.subject) metaParts.push(submission.subject);
            if (submission.category) metaParts.push(submission.category);
            if (attachmentCount) metaParts.push(attachmentCount + " " + pluralize(attachmentCount, ['файл', 'файла', 'файлов']));
            metaParts.push(formatShortDate(submission.created_at));
            const title = submission.title && submission.title.trim() && submission.title !== "Без названия"
              ? submission.title
              : "";
            return `<button class="row-card row-card--order${active ? " is-active" : ""}" type="button" data-submission-id="${submission.id}" aria-pressed="${
              active ? "true" : "false"
            }" title="${escapeHtml(statusLabel)}">` +
              `<div class="row-order-top">` +
                `<span class="channel-chip channel-chip--${chInfo.channel}" aria-hidden="true">${chInfo.icon}</span>` +
                `<span class="row-contact">${escapeHtml(contact)}</span>` +
                `<span class="${dotKlass}" aria-label="${escapeHtml(statusLabel)}"></span>` +
              `</div>` +
              `<div class="row-order-meta">${metaParts.map(escapeHtml).join(" · ")}</div>` +
              (title ? `<div class="row-order-topic">${escapeHtml(title)}</div>` : "") +
            `</button>`;
          })
          .join("")
      : `<div class="empty-state">По этому фильтру работ нет. Переключитесь на «Все» или очистите поиск.</div>`;

    els.submissionList.querySelectorAll("[data-submission-id]").forEach((card) => {
      card.addEventListener("click", () => {
        state.selectedSubmissionId = Number(card.dataset.submissionId || 0);
        renderSubmissions();
        renderSubmissionDetail();
        revealOnCompactLayout(els.submissionDetail && !els.submissionDetail.hidden ? els.submissionDetail : els.submissionEmpty);
      });
    });

    if (!state.selectedSubmissionId && submissions[0]) state.selectedSubmissionId = Number(submissions[0].id);
    renderSubmissionDetail();
  }

  function renderSubmissionDetail() {
    const submission = state.submissions.find((item) => Number(item.id) === Number(state.selectedSubmissionId));
    if (!submission) {
      if (els.submissionEmpty) els.submissionEmpty.hidden = false;
      if (els.submissionDetail) els.submissionDetail.hidden = true;
      return;
    }

    if (els.submissionEmpty) els.submissionEmpty.hidden = true;
    if (els.submissionDetail) els.submissionDetail.hidden = false;

    const attachments = Array.isArray(submission.attachments) ? submission.attachments : [];
    const antivirus = submission.antivirus || {};
    const [statusLabel, statusClass] = statusMeta("submission", submission.status);
    const selectedStoredName = attachments[0] ? attachments[0].stored_name || "" : "";
    const nextId = nextIdFromCollection(actionableSubmissions(), submission.id);

    const chInfo = submissionChannelIcon(submission);
    const contact = submission.contact || submission.author_name || "Контакт не указан";
    const history = clientHistoryForSubmission(submission);
    const historyWord = pluralize(history.length, ['предыдущая работа', 'предыдущие работы', 'предыдущих работ']);

    const chips = [];
    if (submission.subject)   chips.push(["Предмет",   submission.subject]);
    if (submission.category)  chips.push(["Категория", submission.category]);
    if (submission.doc_type)  chips.push(["Тип",       submission.doc_type]);
    if (submission.course)    chips.push(["Курс",      submission.course]);

    const historyHtml = history.length
      ? `<div class="client-history">` +
          `<div class="client-history-head">${history.length} ${historyWord} от этого автора</div>` +
          `<div class="client-history-list">` +
          history.slice(0, 5).map((h) => {
            const [hLabel] = statusMeta("submission", h.status);
            const dotK = "status-dot status-dot--" + (h.status || "new");
            return `<button class="client-history-item" type="button" data-jump-submission="${h.id}">` +
              `<span class="${dotK}" aria-label="${escapeHtml(hLabel)}"></span>` +
              `<span class="client-history-type">${escapeHtml(h.title || "Без названия")}</span>` +
              `<span class="client-history-date">${escapeHtml(formatShortDate(h.created_at))}</span>` +
              `</button>`;
          }).join("") +
          (history.length > 5 ? `<div class="client-history-more">+ ещё ${history.length - 5}</div>` : "") +
          `</div>` +
        `</div>`
      : "";

    const titleHtml = submission.title && submission.title.trim() && submission.title !== "Без названия"
      ? `<h4 class="order-context-topic">${escapeHtml(submission.title)}</h4>`
      : "";

    const descriptionHtml = (submission.description && String(submission.description).trim())
      ? `<div class="order-context-comment"><span class="order-context-kicker">Описание автора</span><p>${escapeHtml(String(submission.description))}</p></div>`
      : "";

    const chipsHtml = chips.length
      ? `<div class="order-context-chips">` +
        chips.map(([k, v]) => `<span class="order-chip"><span class="order-chip-k">${escapeHtml(k)}</span><span class="order-chip-v">${escapeHtml(String(v))}</span></span>`).join("") +
        `</div>`
      : "";

    const antivirusHint = antivirus.status
      ? `Антивирус: ${escapeHtml(antivirus.status)}`
      : "Антивирус: нет данных";

    const statusPillsHtml = SUBMISSION_STATUS_PILLS.map((opt) =>
      `<button class="filter-chip filter-chip--${opt.value}${submission.status === opt.value ? " is-active" : ""}" type="button" data-submission-quick-status="${opt.value}">${escapeHtml(opt.short)}</button>`
    ).join("");

    els.submissionDetail.innerHTML =
      `<div class="contact-hero">` +
        `<span class="channel-chip channel-chip--${chInfo.channel} channel-chip--lg" title="${escapeHtml(chInfo.label)}" aria-hidden="true">${chInfo.icon}</span>` +
        `<div class="contact-hero-body">` +
          `<div class="contact-hero-value">${escapeHtml(contact)}</div>` +
          `<div class="contact-hero-meta"><span class="${statusClass}">${escapeHtml(statusLabel)}</span> · ${escapeHtml(chInfo.label)} · ${escapeHtml(formatDate(submission.created_at))}</div>` +
        `</div>` +
        `<div class="contact-hero-actions">` +
          `<button class="icon-btn" type="button" data-copy-text="${escapeHtml(submission.contact || "")}" title="Скопировать контакт" aria-label="Скопировать контакт">⧉</button>` +
          `<button class="icon-btn" type="button" data-next-submission-inline${nextId ? "" : " disabled"} title="Следующая работа" aria-label="Следующая работа">→</button>` +
        `</div>` +
      `</div>` +

      historyHtml +

      `<div class="order-context">` +
        titleHtml +
        descriptionHtml +
        chipsHtml +
      `</div>` +

      (attachments.length ? `<details class="order-files-block" open>` +
        `<summary><span>Файлы (${attachments.length})</span><span class="order-files-hint">${escapeHtml(antivirus.status || "нет данных")}</span></summary>` +
        `<div class="attachment-list">` +
          attachments.map((a) =>
            `<button class="ghost-btn" type="button" data-download-kind="library" data-owner-id="${submission.id}" data-stored-name="${escapeHtml(a.stored_name || "")}" data-download-name="${escapeHtml(a.name || a.stored_name || "Файл")}">${escapeHtml(a.name || a.stored_name || "Файл")} · ${escapeHtml(a.size_label || formatFileSize(a.size_bytes))}</button>`
          ).join("") +
        `</div>` +
      `</details>` : "") +

      `<section class="order-actions" aria-label="Действия по работе">` +
        `<div class="filter-chips" role="tablist" aria-label="Статус работы">${statusPillsHtml}</div>` +

        `<details class="order-note-block" ${submission.manager_note ? "open" : ""}>` +
          `<summary><span>Внутренняя заметка</span><span class="order-note-hint">${escapeHtml(submission.manager_note ? (submission.manager_note.length > 40 ? submission.manager_note.slice(0, 40) + "…" : submission.manager_note) : "пусто")}</span></summary>` +
          `<label class="field field--full"><textarea id="submissionManagerNote" rows="3" placeholder="Например: хороший материал, подчистить название">${escapeHtml(submission.manager_note || "")}</textarea></label>` +
          `<div class="button-row"><button class="ghost-btn" type="button" id="submissionSaveBtn">Сохранить</button></div>` +
          `<p class="helper-text" id="submissionStatusNote">${antivirusHint}</p>` +
        `</details>` +

        `<details class="order-response-block">` +
          `<summary><span>Опубликовать в каталог</span><span class="order-response-hint">${attachments.length ? "готово к публикации" : "нет файлов"}</span></summary>` +
          `<p class="detail-section-note">Можно подправить поля и нажать «Опубликовать». Работа переедет в каталог.</p>` +
          `<div class="field-grid">` +
            `<label class="field"><span>Файл</span><select id="submissionPublishStored">${attachments.map((a) => `<option value="${escapeHtml(a.stored_name || "")}"${(a.stored_name || "") === selectedStoredName ? " selected" : ""}>${escapeHtml(a.name || a.stored_name || "Файл")}</option>`).join("")}</select></label>` +
            `<label class="field field--full"><span>Название карточки</span><input id="publishTitle" type="text" value="${escapeHtml(submission.title || "")}" /></label>` +
            `<label class="field field--full"><span>Описание карточки</span><textarea id="publishDescription" rows="3">${escapeHtml(submission.description || "")}</textarea></label>` +
            `<label class="field"><span>Категория</span><input id="publishCategory" type="text" list="categoryOptions" value="${escapeHtml(submission.category || "")}" /></label>` +
            `<label class="field"><span>Предмет</span><input id="publishSubject" type="text" list="subjectOptions" value="${escapeHtml(submission.subject || "")}" /></label>` +
            `<label class="field"><span>Курс</span><input id="publishCourse" type="text" list="courseOptions" value="${escapeHtml(submission.course || "")}" /></label>` +
            `<label class="field"><span>Тип</span><input id="publishDocType" type="text" value="${escapeHtml(submission.doc_type || "")}" /></label>` +
            `<label class="field field--full"><span>Теги через запятую</span><input id="publishTags" type="text" value="${escapeHtml(tagsToString(submission.tags))}" /></label>` +
          `</div>` +
          `<div class="button-row"><button class="primary-btn" type="button" id="submissionPublishBtn"${attachments.length ? "" : " disabled"}>Опубликовать</button></div>` +
        `</details>` +

        `<div class="submission-legacy-status" hidden><select id="submissionStatusEditor">${SUBMISSION_STATUS_OPTIONS.map(([v, l]) => `<option value="${v}"${v === (submission.status || "new") ? " selected" : ""}>${l}</option>`).join("")}</select></div>` +
      `</section>`;

    bindCopyButtons(els.submissionDetail);
    bindAttachmentDownloads(els.submissionDetail);

    const saveBtn = document.getElementById("submissionSaveBtn");
    const publishBtn = document.getElementById("submissionPublishBtn");
    els.submissionDetail.querySelectorAll("[data-submission-quick-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const status = button.dataset.submissionQuickStatus || "new";
        try {
          await withButtonBusy(button, "Сохраняем…", async () => {
            await saveSubmissionUpdates(
              submission.id,
              {
                status,
                manager_note: inputValue(document.getElementById("submissionManagerNote")),
              },
              "Статус работы сохранён",
              { moveToNext: status === "rejected" || status === "archived" }
            );
          });
        } catch (error) {
          showToast(error.message || "Не удалось обновить работу", "error");
        }
      });
    });
    els.submissionDetail.querySelectorAll("[data-jump-submission]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = Number(btn.dataset.jumpSubmission || 0);
        if (target) jumpToSubmission(target);
      });
    });
    const nextButton = els.submissionDetail.querySelector("[data-next-submission-inline]");
    if (nextButton) {
      nextButton.addEventListener("click", () => {
        if (nextId) jumpToSubmission(nextId);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        try {
          await withButtonBusy(saveBtn, "Сохраняем…", async () => {
            await saveSubmissionUpdates(
              submission.id,
              {
                status: inputValue(document.getElementById("submissionStatusEditor")) || submission.status,
                manager_note: inputValue(document.getElementById("submissionManagerNote")),
              },
              "Статус работы сохранён"
            );
          });
        } catch (error) {
          showToast(error.message || "Не удалось сохранить статус", "error");
        }
      });
    }

    if (publishBtn) {
      publishBtn.addEventListener("click", async () => {
        try {
          await withButtonBusy(publishBtn, "Публикуем…", async () => {
            await publishSubmissionToCatalog(submission.id, {
                stored: inputValue(document.getElementById("submissionPublishStored")),
                manager_note: inputValue(document.getElementById("submissionManagerNote")),
                doc: {
                  title: inputValue(document.getElementById("publishTitle")),
                  description: inputValue(document.getElementById("publishDescription")),
                  category: inputValue(document.getElementById("publishCategory")),
                  subject: inputValue(document.getElementById("publishSubject")),
                  course: inputValue(document.getElementById("publishCourse")),
                  docType: inputValue(document.getElementById("publishDocType")),
                  tags: inputValue(document.getElementById("publishTags")),
                },
              });
            });
        } catch (error) {
          showToast(error.message || "Не удалось опубликовать работу", "error");
        }
      });
    }
  }

  function renderDelivery() {
    const counts = (state.outbox && state.outbox.counts) || {};
    if (els.deliveryMetrics) {
      const metrics = [
        [counts.pending || 0, "Ожидают", "ещё не выполнены"],
        [counts.processing || 0, "В работе", "сейчас исполняются"],
        [counts.failed || 0, "С ошибкой", "нужен повтор или разбор"],
        [counts.done || 0, "Выполнено", "успешно завершены"],
      ];
      els.deliveryMetrics.innerHTML = metrics
        .map(
          ([value, label, note]) =>
            `<article class="metric-tile"><span class="metric-value">${escapeHtml(String(value))}</span><span class="metric-label">${escapeHtml(
              label
            )}</span><span class="metric-note">${escapeHtml(note)}</span></article>`
        )
        .join("");
    }

    if (els.deliveryJobs) {
      const jobs = Array.isArray((state.outbox && state.outbox.recentJobs) ? state.outbox.recentJobs : [])
        ? state.outbox.recentJobs
        : [];
      els.deliveryJobs.innerHTML = jobs.length
        ? jobs
            .map((job) => {
              const [label, klass] = statusMeta("job", job.status);
              return `<article class="row-card"><div class="row-top"><div><div class="row-title">${escapeHtml(
                job.task_type || "job"
              )}</div><div class="row-subtitle">ID ${job.id} · попыток ${job.attempts}/${job.max_attempts} · ${escapeHtml(
                formatShortDate(job.updated_at)
              )}</div></div><span class="${klass}">${escapeHtml(label)}</span></div>${
                job.last_error ? `<p class="row-meta">${escapeHtml(job.last_error)}</p>` : ""
              }<div class="detail-actions" style="margin-top:12px">${
                job.status === "failed"
                  ? `<button class="ghost-btn" type="button" data-retry-job="${job.id}">Повторить</button>`
                  : ""
              }</div></article>`;
            })
            .join("")
        : `<div class="empty-state">Очередь сейчас чистая.</div>`;

      els.deliveryJobs.querySelectorAll("[data-retry-job]").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await apiJson("/api/admin/outbox/retry", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId: Number(button.dataset.retryJob || 0) }),
            });
            showToast("Задача возвращена в очередь", "success");
            await refreshAll();
          } catch (error) {
            showToast(error.message || "Не удалось повторить задачу", "error");
          }
        });
      });
    }

    if (els.deliveryTech) {
      const checks = (state.health && state.health.checks) || {};
      const warnings = Array.isArray((state.health || {}).warnings) ? state.health.warnings : [];
      const items = [
        {
          title: "Upload sessions",
          ok: true,
          note: `${Number((state.outbox || {}).staleUploadSessions || 0)} протухших загрузок`,
        },
        {
          title: "Идемпотентность",
          ok: true,
          note: `${Number((state.outbox || {}).idempotencyKeys || 0)} активных ключей`,
        },
        {
          title: "VK",
          ok: Boolean(checks.notifications && checks.notifications.vk),
          note: checks.notifications && checks.notifications.vk ? "Подключён" : "Не настроен",
        },
        {
          title: "Telegram форум",
          ok: Boolean(checks.notifications && checks.notifications.telegramForum),
          note: checks.notifications && checks.notifications.telegramForum ? "Подключён" : "Не настроен",
        },
        {
          title: "Email",
          ok: Boolean(checks.notifications && checks.notifications.email),
          note: checks.notifications && checks.notifications.email ? "Подключён" : "Не настроен",
        },
      ];

      const warningHtml = warnings.length
        ? warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")
        : `<p>Предупреждений нет.</p>`;

      els.deliveryTech.innerHTML =
        items
          .map((item) => {
            const [, klass] = statusMeta("system", item.ok);
            return `<article class="system-card"><div class="row-top"><strong>${escapeHtml(item.title)}</strong><span class="${klass}">${item.ok ? "ОК" : "Проверить"}</span></div><p>${escapeHtml(
              item.note
            )}</p></article>`;
          })
          .join("") +
        `<article class="system-card"><div class="row-top"><strong>Предупреждения</strong><span class="status-pill${warnings.length ? " status-pill--danger" : " status-pill--ok"}">${
          warnings.length ? warnings.length : "0"
        }</span></div>${warningHtml}</article>`;
    }
  }

  function bindOpenTabButtons(container) {
    if (!container) return;
    container.querySelectorAll("[data-open-tab]").forEach((button) => {
      button.addEventListener("click", () => togglePanel(button.dataset.openTab || "overview"));
    });
  }

  function bindSummaryActions(container) {
    if (!container) return;
    container.querySelectorAll("[data-open-order]").forEach((button) => {
      button.addEventListener("click", () => {
        jumpToOrder(button.dataset.openOrder || 0);
      });
    });
    container.querySelectorAll("[data-open-submission]").forEach((button) => {
      button.addEventListener("click", () => {
        jumpToSubmission(button.dataset.openSubmission || 0);
      });
    });
  }

  function jumpToDoc(file) {
    state.selectedDocFile = file || "";
    togglePanel("catalog");
    renderCatalog();
    revealOnCompactLayout(els.catalogEditor && !els.catalogEditor.hidden ? els.catalogEditor : els.catalogEmpty);
  }

  function jumpToOrder(id) {
    state.selectedOrderId = Number(id || 0);
    togglePanel("orders");
    renderOrders();
    revealOnCompactLayout(els.orderEditor && !els.orderEditor.hidden ? els.orderEditor : els.orderEmpty);
  }

  function jumpToSubmission(id) {
    state.selectedSubmissionId = Number(id || 0);
    togglePanel("submissions");
    renderSubmissions();
    revealOnCompactLayout(els.submissionDetail && !els.submissionDetail.hidden ? els.submissionDetail : els.submissionEmpty);
  }

  function clearCommandResults() {
    if (!els.commandResults) return;
    els.commandResults.hidden = true;
    els.commandResults.innerHTML = "";
  }

  function resetCommandSearch() {
    if (!els.commandSearch) return;
    els.commandSearch.value = "";
    els.commandSearch.blur();
    clearCommandResults();
  }

  function searchAdminEntities(query) {
    const q = normalizeSearchText(query);
    if (!q) return { docs: [], orders: [], submissions: [] };

    const docs = state.docs
      .filter((doc) =>
        [doc.catalogTitle, doc.title, doc.filename, doc.subject, doc.category, doc.file]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 4);

    const orders = state.orders
      .filter((order) =>
        [order.topic, order.contact, order.subject, order.work_type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 4);

    const submissions = state.submissions
      .filter((submission) =>
        [submission.title, submission.contact, submission.subject, submission.category, submission.author_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 4);

    return { docs, orders, submissions };
  }

  function renderCommandResults() {
    if (!els.commandSearch || !els.commandResults) return;
    const query = inputValue(els.commandSearch);
    if (!query) {
      clearCommandResults();
      return;
    }

    const results = searchAdminEntities(query);
    const sections = [];

    if (results.docs.length) {
      sections.push(`
        <section class="command-group">
          <h4>Каталог</h4>
          ${results.docs
            .map(
              (doc) => `<button class="command-hit" type="button" data-command-doc="${escapeHtml(doc.file)}">
                <strong>${escapeHtml(doc.catalogTitle || doc.title || doc.filename || "Документ")}</strong>
                <p>${escapeHtml(doc.subject || "Без предмета")} · ${escapeHtml(doc.category || "Без категории")}</p>
              </button>`
            )
            .join("")}
        </section>
      `);
    }

    if (results.orders.length) {
      sections.push(`
        <section class="command-group">
          <h4>Заявки</h4>
          ${results.orders
            .map(
              (order) => `<button class="command-hit" type="button" data-command-order="${order.id}">
                <strong>${escapeHtml(order.topic || "Без темы")}</strong>
                <p>${escapeHtml(order.contact || "Контакт не указан")} · ${escapeHtml(order.subject || "Без предмета")}</p>
              </button>`
            )
            .join("")}
        </section>
      `);
    }

    if (results.submissions.length) {
      sections.push(`
        <section class="command-group">
          <h4>Входящие работы</h4>
          ${results.submissions
            .map(
              (submission) => `<button class="command-hit" type="button" data-command-submission="${submission.id}">
                <strong>${escapeHtml(submission.title || "Без названия")}</strong>
                <p>${escapeHtml(submission.contact || "Контакт не указан")} · ${escapeHtml(submission.subject || "Без предмета")}</p>
              </button>`
            )
            .join("")}
        </section>
      `);
    }

    if (!sections.length) {
      els.commandResults.hidden = false;
      els.commandResults.innerHTML = `<div class="empty-state">Ничего не найдено. Попробуйте тему, контакт, предмет или название документа.</div>`;
      return;
    }

    els.commandResults.hidden = false;
    els.commandResults.innerHTML = `<div class="command-results-grid">${sections.join("")}</div>`;

    els.commandResults.querySelectorAll("[data-command-doc]").forEach((button) => {
      button.addEventListener("click", () => {
        jumpToDoc(button.dataset.commandDoc || "");
        resetCommandSearch();
      });
    });

    els.commandResults.querySelectorAll("[data-command-order]").forEach((button) => {
      button.addEventListener("click", () => {
        jumpToOrder(button.dataset.commandOrder || 0);
        resetCommandSearch();
      });
    });

    els.commandResults.querySelectorAll("[data-command-submission]").forEach((button) => {
      button.addEventListener("click", () => {
        jumpToSubmission(button.dataset.commandSubmission || 0);
        resetCommandSearch();
      });
    });
  }

  function bindCopyButtons(container) {
    if (!container) return;
    container.querySelectorAll("[data-copy-text]").forEach((button) => {
      button.addEventListener("click", async () => {
        const ok = await copyText(button.dataset.copyText || "", "Скопировано");
        if (ok) flashCopied(button);
      });
    });
  }

  function bindAttachmentDownloads(container) {
    if (!container) return;
    container.querySelectorAll("[data-download-kind]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const file = await apiBlob(
            `/api/admin/attachment?kind=${encodeURIComponent(button.dataset.downloadKind || "")}&id=${encodeURIComponent(
              button.dataset.ownerId || ""
            )}&stored=${encodeURIComponent(button.dataset.storedName || "")}`
          );
          const url = URL.createObjectURL(file.blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = file.filename || button.dataset.downloadName || "attachment";
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        } catch (error) {
          showToast(error.message || "Не удалось скачать файл", "error");
        }
      });
    });
  }

  function renderAll() {
    collectOptions();
    renderNavCounts();
    renderOverview();
    renderCatalog();
    renderOrders();
    renderSubmissions();
    renderDelivery();
    renderUploadPreview();
    setLoggedInState();
  }

  function renderSkeletons() {
    if (els.overviewHeroTiles && !els.overviewHeroTiles.innerHTML.trim()) {
      els.overviewHeroTiles.innerHTML = Array.from({ length: 4 }, () =>
        `<div class="hero-tile"><span class="skeleton" style="height:12px;width:60%"></span><span class="skeleton" style="height:32px;width:40%"></span><span class="skeleton" style="height:12px;width:80%"></span></div>`
      ).join("");
    }
    [els.overviewAttention, els.overviewRecentOrders].forEach((list) => {
      if (list && !list.innerHTML.trim()) {
        list.innerHTML = Array.from({ length: 3 }, () => `<div class="skeleton skeleton-row"></div>`).join("");
      }
    });
  }

  async function refreshAll(options = {}) {
    if (!state.token) return;
    if (!options.silent && els.sessionState) {
      els.sessionState.textContent = "Обновляем…";
    }
    if (!state.lastSyncAt) renderSkeletons();
    try {
      const payload = await apiJson("/api/admin/bootstrap");
      applyBootstrap(payload);
      renderAll();
    } catch (error) {
      showToast(error.message || "Не удалось обновить данные", "error");
      if (/unauthorized|не авторизованы|401/i.test(String(error.message || ""))) {
        setLoggedOutState();
      } else if (els.sessionState) {
        els.sessionState.textContent = "Ошибка обновления";
      }
    }
  }

  async function verifySession() {
    if (!state.token) {
      setLoggedOutState();
      return;
    }
    try {
      await apiJson("/api/admin/verify");
      await refreshAll({ silent: true });
    } catch (_error) {
      setLoggedOutState();
    }
  }

  if (els.loginForm) {
    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = inputValue(els.password);
      if (!password) {
        if (els.loginError) els.loginError.textContent = "Введите пароль администратора.";
        if (els.password) els.password.focus();
        return;
      }
      if (els.loginError) els.loginError.textContent = "";
      try {
        await withButtonBusy(els.loginBtn, "Проверяем…", async () => {
          const response = await apiJson("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          });
          state.token = response.token || "";
          sessionStorage.setItem(TOKEN_KEY, state.token);
          if (els.password) els.password.value = "";
          await verifySession();
          showToast("Вход выполнен", "success");
        });
      } catch (error) {
        if (els.loginError) els.loginError.textContent = error.message || "Не удалось войти.";
        if (els.password) { els.password.focus(); els.password.select(); }
      }
    });
  }

  // Password show / hide
  if (els.passwordToggle && els.password) {
    els.passwordToggle.addEventListener("click", () => {
      const shown = els.password.type === "text";
      els.password.type = shown ? "password" : "text";
      els.passwordToggle.setAttribute("aria-pressed", shown ? "false" : "true");
      els.passwordToggle.setAttribute("aria-label", shown ? "Показать пароль" : "Скрыть пароль");
      els.password.focus();
    });
  }

  // Caps Lock live indicator while typing password
  if (els.password && els.capsHint) {
    const syncCaps = (event) => {
      const on = event && typeof event.getModifierState === "function"
        ? event.getModifierState("CapsLock")
        : false;
      els.capsHint.dataset.on = on ? "1" : "0";
    };
    els.password.addEventListener("keydown", syncCaps);
    els.password.addEventListener("keyup", syncCaps);
    els.password.addEventListener("blur", () => { els.capsHint.dataset.on = "0"; });
  }

  if (els.logoutBtn) {
    els.logoutBtn.addEventListener("click", async () => {
      await withButtonBusy(els.logoutBtn, "Выходим…", async () => {
        try {
          await apiJson("/api/admin/logout", { method: "POST" });
        } catch (_error) {}
        setLoggedOutState();
        showToast("Вы вышли из админки", "success");
      });
    });
  }

  if (els.refreshBtn) {
    els.refreshBtn.addEventListener("click", async () => {
      await withButtonBusy(els.refreshBtn, "Обновляем…", async () => {
        await refreshAll();
      });
    });
  }

  if (els.commandSearch) {
    els.commandSearch.addEventListener("input", () => {
      renderCommandResults();
    });

    els.commandSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const firstResult = els.commandResults ? els.commandResults.querySelector(".command-hit") : null;
        if (firstResult) {
          event.preventDefault();
          firstResult.click();
        }
      }
      if (event.key === "Escape") {
        resetCommandSearch();
      }
    });
  }

  /* Bind every element that declares data-open-tab (action cards, col links, etc.) */
  bindOpenTabButtons(document);

  els.tabs.forEach((button) => {
    button.addEventListener("click", () => togglePanel(button.dataset.tab || "overview"));
  });

  function toggleKbdHelp(force) {
    if (!els.kbdHelp) return;
    const currentlyHidden = els.kbdHelp.hidden;
    const nextHidden = typeof force === "boolean" ? !force : !currentlyHidden;
    els.kbdHelp.hidden = nextHidden;
    if (!nextHidden && els.kbdHelpClose) {
      // Focus close button for a11y when opening
      setTimeout(() => els.kbdHelpClose.focus(), 20);
    }
  }
  if (els.kbdHelpClose) {
    els.kbdHelpClose.addEventListener("click", () => toggleKbdHelp(false));
  }
  if (els.kbdHelp) {
    els.kbdHelp.addEventListener("click", (event) => {
      if (event.target === els.kbdHelp) toggleKbdHelp(false);
    });
  }

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const editable =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

    // Escape closes help overlay regardless of focus
    if (event.key === "Escape" && els.kbdHelp && !els.kbdHelp.hidden) {
      event.preventDefault();
      toggleKbdHelp(false);
      return;
    }

    if (!editable && state.token) {
      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        toggleKbdHelp();
        return;
      }
      if (event.key === "/" || event.code === "Slash") {
        event.preventDefault();
        if (els.commandSearch) els.commandSearch.focus();
        return;
      }

      const tabMap = {
        1: "overview",
        2: "orders",
        3: "submissions",
        4: "catalog",
        5: "upload",
        6: "calendar",
      };
      if (tabMap[event.key]) {
        event.preventDefault();
        togglePanel(tabMap[event.key]);
      }

      // J / K — prev/next item within the current tab's filtered list
      // (orders + submissions). Russian "о"/"л" keys map to J/K.
      if ((state.activeTab === "orders" || state.activeTab === "submissions")
          && (event.key === "j" || event.key === "k" || event.key === "J" || event.key === "K"
              || event.key === "о" || event.key === "О" || event.key === "л" || event.key === "Л")) {
        const isSubmissions = state.activeTab === "submissions";
        const list = isSubmissions ? filteredSubmissions() : filteredOrders();
        if (!list.length) return;
        const selectedId = Number(isSubmissions ? state.selectedSubmissionId : state.selectedOrderId);
        const idx = Math.max(0, list.findIndex((o) => Number(o.id) === selectedId));
        const isNext = (event.key === "j" || event.key === "J" || event.key === "о" || event.key === "О");
        const nextIdx = Math.max(0, Math.min(list.length - 1, idx + (isNext ? 1 : -1)));
        const target = list[nextIdx];
        if (target && Number(target.id) !== selectedId) {
          event.preventDefault();
          if (isSubmissions) jumpToSubmission(target.id);
          else jumpToOrder(target.id);
        }
      }
    }

    if (event.key === "Escape" && els.commandSearch && document.activeElement === els.commandSearch) {
      resetCommandSearch();
    }
  });

  document.addEventListener("click", (event) => {
    if (!els.commandResults || !els.commandSearch) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (els.commandResults.contains(target) || els.commandSearch.contains(target)) return;
    clearCommandResults();
  });

  if (els.catalogSearch) els.catalogSearch.addEventListener("input", renderCatalog);
  if (els.catalogQuickFilter) els.catalogQuickFilter.addEventListener("change", renderCatalog);
  if (els.orderSearch) els.orderSearch.addEventListener("input", renderOrders);
  if (els.orderStatusFilter) els.orderStatusFilter.addEventListener("change", renderOrders);
  if (els.submissionSearch) els.submissionSearch.addEventListener("input", renderSubmissions);
  if (els.submissionStatusFilter) els.submissionStatusFilter.addEventListener("change", renderSubmissions);

  if (els.catalogEditor) {
    els.catalogEditor.addEventListener("submit", async (event) => {
      event.preventDefault();
      const doc = state.docs.find((item) => item.file === state.selectedDocFile);
      if (!doc) return;
      try {
        await withButtonBusy(els.catalogSaveBtn, "Сохраняем…", async () => {
          await apiJson("/api/admin/docs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              file: doc.file,
              updates: {
                title: inputValue(els.catalogTitle),
                description: inputValue(els.catalogDescription),
                category: inputValue(els.catalogCategory),
                subject: inputValue(els.catalogSubject),
                course: inputValue(els.catalogCourse),
                docType: inputValue(els.catalogDocType),
                tags: stringToTags(inputValue(els.catalogTags)),
                catalogTitle: inputValue(els.catalogTitle),
                catalogDescription: inputValue(els.catalogDescription),
              },
            }),
          });
        });
        if (els.catalogStatus) els.catalogStatus.textContent = "Изменения сохранены.";
        showToast("Карточка документа обновлена", "success");
        await refreshAll({ silent: true });
      } catch (error) {
        if (els.catalogStatus) els.catalogStatus.textContent = error.message || "Не удалось сохранить документ.";
        showToast(error.message || "Не удалось сохранить документ", "error");
      }
    });
  }

  if (els.catalogDeleteBtn) {
    const DEFAULT_DELETE_LABEL = els.catalogDeleteBtn.textContent;
    let confirmTimer = null;
    const resetConfirm = () => {
      els.catalogDeleteBtn.classList.remove("is-confirm");
      els.catalogDeleteBtn.textContent = DEFAULT_DELETE_LABEL;
      if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
    };
    els.catalogDeleteBtn.addEventListener("click", async () => {
      const doc = state.docs.find((item) => item.file === state.selectedDocFile);
      if (!doc) return;

      // First click primes confirmation; second within 4s executes
      if (!els.catalogDeleteBtn.classList.contains("is-confirm")) {
        els.catalogDeleteBtn.classList.add("is-confirm");
        els.catalogDeleteBtn.textContent = "Точно удалить?";
        confirmTimer = setTimeout(resetConfirm, 4000);
        return;
      }

      resetConfirm();
      try {
        await withButtonBusy(els.catalogDeleteBtn, "Удаляем…", async () => {
          await apiJson("/api/admin/docs", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: doc.file }),
          });
        });
        state.selectedDocFile = "";
        showToast("Документ удалён", "success");
        await refreshAll({ silent: true });
      } catch (error) {
        showToast(error.message || "Не удалось удалить документ", "error");
      }
    });
  }

  if (els.orderEditor) {
    els.orderEditor.addEventListener("submit", async (event) => {
      event.preventDefault();
      const order = state.orders.find((item) => Number(item.id) === Number(state.selectedOrderId));
      if (!order) return;
      try {
        await withButtonBusy(els.orderSaveBtn, "Сохраняем…", async () => {
          await saveOrderUpdates(
            order.id,
            {
              status: inputValue(els.orderStatus) || order.status,
              manager_note: inputValue(els.orderNote),
            },
            "Заявка обновлена"
          );
        });
        if (els.orderStatusNote) els.orderStatusNote.textContent = "Статус заявки сохранён.";
      } catch (error) {
        if (els.orderStatusNote) els.orderStatusNote.textContent = error.message || "Не удалось сохранить заявку.";
        showToast(error.message || "Не удалось сохранить заявку", "error");
      }
    });
  }

  /* Order response textarea — enable "Отправить" only when non-empty */
  if (els.orderResponse && els.orderSendBtn) {
    const syncSendBtn = () => {
      els.orderSendBtn.disabled = !els.orderResponse.value.trim();
    };
    els.orderResponse.addEventListener("input", syncSendBtn);
    syncSendBtn();

    els.orderSendBtn.addEventListener("click", async () => {
      const order = state.orders.find((item) => Number(item.id) === Number(state.selectedOrderId));
      if (!order) return;
      const message = els.orderResponse.value.trim();
      if (!message) return;
      const channel = inputValue(els.orderResponseChannel) || "auto";
      if (!confirm(`Отправить ответ клиенту ${order.contact || ""} (${channel})?`)) return;
      try {
        await withButtonBusy(els.orderSendBtn, "Отправляем…", async () => {
          const res = await fetch(`/api/admin/orders/${order.id}/send-response`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + state.token },
            body: JSON.stringify({ channel, message }),
          });
          if (!res.ok) {
            const msg = res.status === 404
              ? "Эндпоинт пока не готов — сохранил текст, скопируйте и отправьте руками."
              : "Сервер не принял ответ (HTTP " + res.status + ")";
            throw new Error(msg);
          }
          const data = await res.json().catch(() => ({}));
          if (!data.ok) throw new Error(data.error || "Ответ не доставлен");
        });
        showToast("Ответ отправлен клиенту", "success");
        if (els.orderResponseNote) els.orderResponseNote.textContent = "Последний ответ успешно доставлен.";
        els.orderResponse.value = "";
        els.orderSendBtn.disabled = true;
      } catch (error) {
        if (els.orderResponseNote) els.orderResponseNote.textContent = error.message || "Не удалось отправить ответ.";
        showToast(error.message || "Не удалось отправить ответ", "error");
      }
    });
  }

  if (els.orderCopyResponseBtn) {
    els.orderCopyResponseBtn.addEventListener("click", async () => {
      const text = (els.orderResponse && els.orderResponse.value) || "";
      if (!text.trim()) { showToast("Напишите текст ответа", "error"); return; }
      const ok = await copyText(text, "Текст скопирован");
      if (ok) flashCopied(els.orderCopyResponseBtn);
    });
  }

  if (els.deliveryCleanupBtn) {
    els.deliveryCleanupBtn.addEventListener("click", async () => {
      try {
        await withButtonBusy(els.deliveryCleanupBtn, "Чистим…", async () => {
          await apiJson("/api/admin/cleanup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
        });
        showToast("Очередь и временные хвосты очищены", "success");
        await refreshAll({ silent: true });
      } catch (error) {
        showToast(error.message || "Не удалось выполнить очистку", "error");
      }
    });
  }

  if (els.uploadFileInput) {
    els.uploadFileInput.addEventListener("change", () => {
      const picked = els.uploadFileInput.files && els.uploadFileInput.files[0] ? els.uploadFileInput.files[0] : null;
      if (picked && picked.size > UPLOAD_MAX_BYTES) {
        showToast(`Файл больше 50 МБ (${formatFileSize(picked.size)}). Сожмите и попробуйте снова.`, "error");
        els.uploadFileInput.value = "";
        state.uploadFile = null;
        if (els.uploadFileInfo) els.uploadFileInfo.textContent = "Файл ещё не выбран";
        renderUploadPreview();
        syncWizardState();
        return;
      }
      state.uploadFile = picked;
      if (els.uploadFileInfo) {
        els.uploadFileInfo.textContent = state.uploadFile
          ? `${state.uploadFile.name} · ${formatFileSize(state.uploadFile.size)}`
          : "Файл ещё не выбран";
      }
      if (state.uploadFile && els.uploadTitle && !inputValue(els.uploadTitle)) {
        els.uploadTitle.value = smartTitleFromFilename(state.uploadFile.name);
      }
      if (state.uploadFile && els.uploadDocType && !inputValue(els.uploadDocType)) {
        const guessed = guessDocTypeFromFilename(state.uploadFile.name);
        if (guessed) els.uploadDocType.value = guessed;
      }
      renderUploadPreview();
      syncWizardState();
    });
  }

  // ═══ Upload wizard — three-step flow ═══
  function syncWizardState() {
    const hasFile = !!state.uploadFile;
    const title   = inputValue(els.uploadTitle).trim();
    const hasFields = title.length > 0;

    const step2Btn = document.querySelector('[data-wizard-next="2"]');
    const step3Btn = document.querySelector('[data-wizard-next="3"]');
    if (step2Btn) step2Btn.disabled = !hasFile;
    if (step3Btn) step3Btn.disabled = !hasFields;

    document.querySelectorAll('.wizard-step').forEach((el) => {
      const n = Number(el.dataset.step);
      let unlocked = true;
      if (n === 2) unlocked = hasFile;
      if (n === 3) unlocked = hasFile && hasFields;
      el.disabled = !unlocked;
    });
  }

  function goToUploadStep(step) {
    const n = Math.max(1, Math.min(3, Number(step) || 1));
    document.querySelectorAll('.wizard-pane').forEach((p) => {
      p.hidden = Number(p.dataset.wizardStep) !== n;
    });
    document.querySelectorAll('.wizard-step').forEach((el) => {
      const s = Number(el.dataset.step);
      el.classList.toggle('is-active', s === n);
      el.classList.toggle('is-done', s < n);
    });
    if (n === 3) renderUploadPreview();
    syncWizardState();
  }

  document.addEventListener('click', (e) => {
    const nextBtn = e.target.closest('[data-wizard-next]');
    if (nextBtn && !nextBtn.disabled) {
      e.preventDefault();
      goToUploadStep(nextBtn.dataset.wizardNext);
      return;
    }
    const backBtn = e.target.closest('[data-wizard-back]');
    if (backBtn) {
      e.preventDefault();
      goToUploadStep(backBtn.dataset.wizardBack);
      return;
    }
    const jumpBtn = e.target.closest('[data-goto-step]');
    if (jumpBtn && !jumpBtn.disabled) {
      e.preventDefault();
      goToUploadStep(jumpBtn.dataset.gotoStep);
    }
  });

  [els.uploadTitle, els.uploadDescription, els.uploadCategory, els.uploadSubject, els.uploadCourse, els.uploadDocType, els.uploadTags]
    .filter(Boolean)
    .forEach((input) => {
      input.addEventListener("input", () => {
        renderUploadPreview();
        syncWizardState();
      });
    });

  if (els.uploadDropzone) {
    ["dragenter", "dragover"].forEach((name) => {
      els.uploadDropzone.addEventListener(name, (event) => {
        event.preventDefault();
        els.uploadDropzone.classList.add("is-drag");
      });
    });
    ["dragleave", "drop"].forEach((name) => {
      els.uploadDropzone.addEventListener(name, (event) => {
        event.preventDefault();
        els.uploadDropzone.classList.remove("is-drag");
      });
    });
    els.uploadDropzone.addEventListener("drop", (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file || !els.uploadFileInput) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      els.uploadFileInput.files = transfer.files;
      els.uploadFileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  if (els.uploadForm) {
    els.uploadForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!state.uploadFile) {
        showToast("Сначала выберите файл.", "error");
        return;
      }
      if (els.uploadBtn) {
        els.uploadBtn.disabled = true;
        els.uploadBtn.textContent = "Загружаем…";
      }
      if (els.uploadStatus) els.uploadStatus.textContent = "Загружаем документ в каталог…";
      if (els.uploadProgress) els.uploadProgress.hidden = false;
      if (els.uploadProgressFill) els.uploadProgressFill.style.width = "0%";

      const formData = new FormData();
      formData.append("file", state.uploadFile);
      formData.append("title", inputValue(els.uploadTitle) || state.uploadFile.name.replace(/\.[^.]+$/, ""));
      formData.append("description", inputValue(els.uploadDescription));
      formData.append("category", inputValue(els.uploadCategory));
      formData.append("subject", inputValue(els.uploadSubject));
      formData.append("course", inputValue(els.uploadCourse));
      formData.append("docType", inputValue(els.uploadDocType));
      formData.append("tags", inputValue(els.uploadTags));

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/upload");
      if (state.token) xhr.setRequestHeader("Authorization", `Bearer ${state.token}`);

      xhr.upload.addEventListener("progress", (uploadEvent) => {
        if (!uploadEvent.lengthComputable || !els.uploadProgressFill) return;
        const percent = Math.round((uploadEvent.loaded / uploadEvent.total) * 100);
        els.uploadProgressFill.style.width = `${percent}%`;
        if (els.uploadStatus) els.uploadStatus.textContent = `Загружаем документ: ${percent}%`;
      });

      xhr.onerror = () => {
        if (els.uploadBtn) {
          els.uploadBtn.disabled = false;
          els.uploadBtn.textContent = "Загрузить в каталог";
        }
        if (els.uploadStatus) els.uploadStatus.textContent = "Ошибка сети при загрузке.";
        showToast("Ошибка сети при загрузке файла", "error");
      };

      xhr.onload = async () => {
        let payload = null;
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch (_error) {
          payload = null;
        }

        if (xhr.status >= 200 && xhr.status < 300 && payload && payload.ok !== false) {
          state.uploadFile = null;
          if (els.uploadFileInput) els.uploadFileInput.value = "";
          if (els.uploadFileInfo) els.uploadFileInfo.textContent = "Файл ещё не выбран";
          if (els.uploadTitle) els.uploadTitle.value = "";
          if (els.uploadDescription) els.uploadDescription.value = "";
          if (els.uploadCategory) els.uploadCategory.value = "";
          if (els.uploadSubject) els.uploadSubject.value = "";
          if (els.uploadCourse) els.uploadCourse.value = "";
          if (els.uploadDocType) els.uploadDocType.value = "";
          if (els.uploadTags) els.uploadTags.value = "";
          if (els.uploadProgressFill) els.uploadProgressFill.style.width = "100%";
          if (els.uploadStatus) {
            const href = buildDocHref(payload.doc && payload.doc.file ? payload.doc.file : "");
            els.uploadStatus.innerHTML = `Готово. <a href="${href}" target="_blank" rel="noopener">Открыть документ</a>`;
          }
          renderUploadPreview();
          showToast("Документ загружен в каталог", "success");
          state.selectedDocFile = payload.doc && payload.doc.file ? payload.doc.file : state.selectedDocFile;
          await refreshAll({ silent: true });
        } else {
          const message = readErrorMessage(payload, xhr.responseText, xhr.status);
          if (els.uploadStatus) els.uploadStatus.textContent = message;
          showToast(message, "error");
        }

        if (els.uploadBtn) {
          els.uploadBtn.disabled = false;
          els.uploadBtn.textContent = "Загрузить в каталог";
        }
      };

      xhr.send(formData);
    });
  }

  /* ═══════ CALENDAR TAB ═══════
     Editable grid of days. Click cycles: free → tight → busy → closed → free.
     Persists to localStorage key academic-salon:calendar as { "YYYY-MM-DD": "state" }.
     Best-effort PUT to /api/admin/calendar for future backend sync. */
  (function initCalendarTab() {
    const CAL_KEY = 'academic-salon:calendar';
    const grid = document.getElementById('adminCalGrid');
    if (!grid) return;

    const monthLabel = document.getElementById('adminCalMonthLabel');
    const prevBtn = document.getElementById('adminCalPrev');
    const nextBtn = document.getElementById('adminCalNext');
    const resetBtn = document.getElementById('adminCalReset');
    const savedCountEl = document.getElementById('adminCalSavedCount');
    const syncStateEl = document.getElementById('adminCalSyncState');
    const metricsEl = document.getElementById('calendarMetrics');
    const navCountEl = document.getElementById('navCountCalendar');

    /* On load, pull server overrides and merge to local cache so UI starts in sync */
    fetch('/api/admin/calendar', {
      headers: { Authorization: 'Bearer ' + (state.token || '') },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.ok || !Array.isArray(data.items)) return;
        const map = {};
        data.items.forEach((it) => { if (it && it.date && it.state) map[it.date] = it.state; });
        try { localStorage.setItem(CAL_KEY, JSON.stringify(map)); } catch (_) {}
        if (syncStateEl) syncStateEl.textContent = 'Синхронизировано с сервером';
        render();
      })
      .catch(() => {});

    const MONTHS = [
      'Январь','Февраль','Март','Апрель','Май','Июнь',
      'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
    ];
    const CYCLE = ['free','tight','busy','closed','free'];

    const today = new Date();
    let cursorYear = today.getFullYear();
    let cursorMonth = today.getMonth();

    function readStore() {
      try { return JSON.parse(localStorage.getItem(CAL_KEY) || '{}') || {}; }
      catch (_) { return {}; }
    }
    function writeStore(store) {
      try { localStorage.setItem(CAL_KEY, JSON.stringify(store)); } catch (_) {}
    }
    function ymd(y, m, d) {
      return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    function nextState(s) {
      const i = CYCLE.indexOf(s || 'free');
      return CYCLE[(i + 1) % (CYCLE.length - 1)];
    }

    function render() {
      if (monthLabel) monthLabel.textContent = MONTHS[cursorMonth] + ' · ' + cursorYear;

      const store = readStore();
      const firstDow = (new Date(cursorYear, cursorMonth, 1).getDay() + 6) % 7;
      const daysInMonth = new Date(cursorYear, cursorMonth + 1, 0).getDate();
      const todayKey = ymd(today.getFullYear(), today.getMonth(), today.getDate());

      let html = '';
      for (let i = 0; i < firstDow; i++) html += '<span class="admin-cal-day empty"></span>';
      for (let d = 1; d <= daysInMonth; d++) {
        const key = ymd(cursorYear, cursorMonth, d);
        const state = store[key] || 'free';
        const isToday = key === todayKey;
        html += `<button type="button" class="admin-cal-day ${state}${isToday ? ' today' : ''}" data-key="${key}">${d}</button>`;
      }
      grid.innerHTML = html;

      const count = Object.keys(store).length;
      if (savedCountEl) savedCountEl.textContent = `Сохранено ${count} ${pluralize(count, ['день', 'дня', 'дней'])}`;
      if (navCountEl) navCountEl.textContent = count ? String(count) : '—';

      if (metricsEl) {
        const totals = { free: 0, tight: 0, busy: 0, closed: 0 };
        Object.values(store).forEach(s => { if (totals[s] !== undefined) totals[s] += 1; });
        metricsEl.innerHTML = `
          <div class="metric"><span class="metric-label">Свободно</span><span class="metric-val">${totals.free}</span></div>
          <div class="metric"><span class="metric-label">Плотно</span><span class="metric-val">${totals.tight}</span></div>
          <div class="metric"><span class="metric-label">Занято</span><span class="metric-val">${totals.busy}</span></div>
          <div class="metric"><span class="metric-label">Прошло</span><span class="metric-val">${totals.closed}</span></div>`;
      }
    }

    function setState(key, nextState) {
      const store = readStore();
      if (nextState === 'free') delete store[key];
      else store[key] = nextState;
      writeStore(store);
      /* Server sync — PUT or clear (state:null). */
      if (state && state.token) {
        fetch('/api/admin/calendar', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.token },
          body: JSON.stringify({ date: key, state: store[key] || null }),
        }).then(function(r) {
          if (syncStateEl) {
            syncStateEl.textContent = r.ok
              ? 'Синхронизировано с сервером'
              : 'Локальная копия — сервер не принял (' + r.status + ')';
          }
        }).catch(function() {
          if (syncStateEl) syncStateEl.textContent = 'Локальная копия — сервер недоступен';
        });
      }
    }

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-cal-day[data-key]');
      if (!btn || btn.classList.contains('empty')) return;
      const key = btn.dataset.key;
      const store = readStore();
      const ns = nextState(store[key] || 'free');
      setState(key, ns);
      render();
    });

    if (prevBtn) prevBtn.addEventListener('click', () => {
      cursorMonth -= 1;
      if (cursorMonth < 0) { cursorMonth = 11; cursorYear -= 1; }
      render();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      cursorMonth += 1;
      if (cursorMonth > 11) { cursorMonth = 0; cursorYear += 1; }
      render();
    });
    if (resetBtn) resetBtn.addEventListener('click', () => {
      if (!confirm('Сбросить все отметки? Вернётся декоративный дефолт с главной.')) return;
      writeStore({});
      render();
    });

    /* Cross-tab sync: if owner opens in two tabs, both stay current */
    window.addEventListener('storage', (e) => { if (e.key === CAL_KEY) render(); });

    render();
  })();

  togglePanel(state.activeTab);
  /* Draw empty state values immediately so Overview shows 0-tiles before login/fetch. */
  try { renderAll(); } catch (_) {}
  verifySession();
}

initAdminApp();
