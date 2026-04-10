(function () {
  const TOKEN_KEY = "salon-admin-token";
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

  function initAdminApp() {
    const root = document.querySelector(".godmode");
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";

    const state = {
      token: sessionStorage.getItem(TOKEN_KEY) || "",
      activeTab: "overview",
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
      },
    };

    const els = {
      tabs: Array.from(document.querySelectorAll(".godmode-tab")),
      topTitle: document.getElementById("adminTopTitle"),
      sessionState: document.getElementById("adminSessionState"),
      authCard: document.getElementById("adminAuthCard"),
      workspace: document.getElementById("adminWorkspace"),
      refreshBtn: document.getElementById("adminRefreshBtn"),
      logoutBtn: document.getElementById("adminLogoutBtn"),
      loginForm: document.getElementById("adminLoginForm"),
      password: document.getElementById("adminPassword"),
      loginBtn: document.getElementById("adminLoginBtn"),
      loginError: document.getElementById("adminLoginError"),
      toastStack: document.getElementById("adminToasts"),
      uploadForm: document.getElementById("adminUploadForm"),
      uploadFileInput: document.getElementById("adminUploadFile"),
      uploadFileInfo: document.getElementById("adminUploadFileInfo"),
      uploadBtn: document.getElementById("uploadSubmitBtn"),
      uploadStatus: document.getElementById("uploadStatus"),
      uploadProgress: document.getElementById("uploadProgress"),
      uploadProgressFill: document.getElementById("uploadProgressFill"),
      uploadDropzone: document.getElementById("adminDropzone"),
      uploadTitle: document.getElementById("uploadTitle"),
      uploadDescription: document.getElementById("uploadDescription"),
      uploadCategory: document.getElementById("uploadCategory"),
      uploadSubject: document.getElementById("uploadSubject"),
      uploadCourse: document.getElementById("uploadCourse"),
      uploadDocType: document.getElementById("uploadDocType"),
      uploadTags: document.getElementById("uploadTags"),
      overviewMetrics: document.getElementById("overviewMetrics"),
      overviewQuick: document.getElementById("overviewQuick"),
      overviewSystem: document.getElementById("overviewSystem"),
      overviewOrders: document.getElementById("overviewOrders"),
      overviewSubmissions: document.getElementById("overviewSubmissions"),
      submissionSearch: document.getElementById("submissionSearch"),
      submissionStatusFilter: document.getElementById("submissionStatusFilter"),
      submissionList: document.getElementById("submissionList"),
      submissionEmpty: document.getElementById("submissionEmpty"),
      submissionDetail: document.getElementById("submissionDetail"),
      catalogSearch: document.getElementById("catalogSearch"),
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
      catalogSaveBtn: document.getElementById("catalogSaveBtn"),
      catalogDeleteBtn: document.getElementById("catalogDeleteBtn"),
      catalogOpenBtn: document.getElementById("catalogOpenBtn"),
      catalogStatus: document.getElementById("catalogStatus"),
      orderSearch: document.getElementById("orderSearch"),
      orderStatusFilter: document.getElementById("orderStatusFilter"),
      orderList: document.getElementById("orderList"),
      orderEmpty: document.getElementById("orderEmpty"),
      orderEditor: document.getElementById("orderEditor"),
      orderSummary: document.getElementById("orderSummary"),
      orderStatus: document.getElementById("orderStatus"),
      orderNote: document.getElementById("orderNote"),
      orderAttachments: document.getElementById("orderAttachments"),
      orderStatusNote: document.getElementById("orderStatusNote"),
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

    function formatDate(timestamp) {
      if (!timestamp) return "—";
      try {
        return new Date(Number(timestamp) * 1000).toLocaleString("ru-RU", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Europe/Moscow",
        });
      } catch (error) {
        return "—";
      }
    }

    function formatShortDate(timestamp) {
      if (!timestamp) return "—";
      try {
        return new Date(Number(timestamp) * 1000).toLocaleString("ru-RU", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Moscow",
        });
      } catch (error) {
        return "—";
      }
    }

    function formatFileSize(bytes) {
      const size = Number(bytes || 0);
      if (!size) return "—";
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    function buildDocHref(file) {
      return `/doc?file=${encodeURIComponent(String(file || ""))}`;
    }

    function showToast(message, kind) {
      if (!els.toastStack) return;
      const toast = document.createElement("div");
      toast.className = `toast${kind === "error" ? " toast--error" : ""}`;
      toast.textContent = message;
      els.toastStack.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-4px)";
        setTimeout(() => toast.remove(), 220);
      }, 3200);
    }

    function normalizeError(payload, fallback) {
      if (!payload) return fallback;
      return payload.error || payload.detail || fallback;
    }

    function authHeaders(extraHeaders) {
      const headers = new Headers(extraHeaders || {});
      if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
      return headers;
    }

    async function apiJson(path, options) {
      const config = options || {};
      const response = await fetch(path, {
        method: config.method || "GET",
        body: config.body,
        headers: authHeaders(config.headers),
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch (error) {
        throw new Error(text || `HTTP ${response.status}`);
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(normalizeError(payload, `HTTP ${response.status}`));
      }
      return payload;
    }

    async function apiBlob(path) {
      const response = await fetch(path, { headers: authHeaders() });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          message = normalizeError(payload, message);
        } catch (error) {}
        throw new Error(message);
      }
      return {
        blob: await response.blob(),
        filename:
          decodeURIComponent(
            (((response.headers.get("Content-Disposition") || "").match(/filename\*=UTF-8''([^;]+)/) || [])[1] || "")
          ) || "attachment",
      };
    }

    function statusMeta(kind, status) {
      const normalized = String(status || "new").trim();
      if (kind === "order") {
        const map = {
          new: ["Новая", "status-chip status-chip--accent"],
          priority: ["Приоритет", "status-chip status-chip--accent"],
          in_work: ["В работе", "status-chip"],
          waiting_client: ["Ждём клиента", "status-chip"],
          done: ["Завершена", "status-chip status-chip--ok"],
          archived: ["Архив", "status-chip"],
        };
        return map[normalized] || [normalized, "status-chip"];
      }
      if (kind === "submission") {
        const map = {
          new: ["Новая", "status-chip status-chip--accent"],
          priority: ["Приоритет", "status-chip status-chip--accent"],
          approved: ["Опубликована", "status-chip status-chip--ok"],
          rejected: ["Отклонена", "status-chip status-chip--danger"],
          delivery_failed: ["Сбой доставки", "status-chip status-chip--danger"],
          archived: ["Архив", "status-chip"],
        };
        return map[normalized] || [normalized, "status-chip"];
      }
      if (kind === "job") {
        const map = {
          pending: ["Ожидает", "status-chip status-chip--accent"],
          processing: ["В работе", "status-chip"],
          failed: ["Ошибка", "status-chip status-chip--danger"],
          done: ["Готово", "status-chip status-chip--ok"],
        };
        return map[normalized] || [normalized, "status-chip"];
      }
      return [normalized, "status-chip"];
    }

    function buildOptions(values, selected, placeholder) {
      const items = Array.from(new Set((values || []).filter(Boolean)));
      if (selected && items.indexOf(selected) === -1) items.unshift(selected);
      const head = placeholder
        ? `<option value="">${escapeHtml(placeholder)}</option>`
        : "";
      return (
        head +
        items
          .map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`)
          .join("")
      );
    }

    function collectOptions() {
      const docs = state.docs || [];
      const submissions = state.submissions || [];
      const categories = [];
      const subjects = [];
      const courses = [""];
      [...docs, ...submissions].forEach((item) => {
        const category = (item.category || "").trim();
        const subject = (item.subject || "").trim();
        const course = (item.course || "").trim();
        if (category && categories.indexOf(category) === -1) categories.push(category);
        if (subject && subjects.indexOf(subject) === -1) subjects.push(subject);
        if (course && courses.indexOf(course) === -1) courses.push(course);
      });
      categories.sort((a, b) => a.localeCompare(b, "ru"));
      subjects.sort((a, b) => a.localeCompare(b, "ru"));
      state.options = { categories, subjects, courses };

      if (els.uploadCategory) els.uploadCategory.innerHTML = buildOptions(categories, "", "Выберите категорию");
      if (els.uploadSubject) els.uploadSubject.innerHTML = buildOptions(subjects, "", "Выберите предмет");
      if (els.uploadCourse) els.uploadCourse.innerHTML = buildOptions(courses, "", "Курс не указан");
      if (els.catalogCategory) els.catalogCategory.innerHTML = buildOptions(categories, "", "Выберите категорию");
      if (els.catalogSubject) els.catalogSubject.innerHTML = buildOptions(subjects, "", "Выберите предмет");
      if (els.catalogCourse) els.catalogCourse.innerHTML = buildOptions(courses, "", "Курс не указан");
      if (els.orderStatus) {
        els.orderStatus.innerHTML = ORDER_STATUS_OPTIONS.map(
          ([value, label]) => `<option value="${value}">${label}</option>`
        ).join("");
      }
    }

    function togglePanel(name) {
      state.activeTab = name;
      els.tabs.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.tab === name);
      });
      document.querySelectorAll(".panel").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== name;
        panel.classList.toggle("is-active", panel.dataset.panel === name);
      });
      const labelMap = {
        overview: "Обзор всех процессов",
        upload: "Ручная загрузка новой работы",
        submissions: "Разбор присланных работ",
        catalog: "Управление опубликованным каталогом",
        orders: "Заявки клиентов",
        delivery: "Очередь уведомлений и служебные процессы",
      };
      if (els.topTitle) els.topTitle.textContent = labelMap[name] || "Пульт библиотеки";
    }

    function setLoggedOutState() {
      state.token = "";
      sessionStorage.removeItem(TOKEN_KEY);
      if (els.sessionState) els.sessionState.textContent = "Не авторизованы";
      if (els.authCard) els.authCard.hidden = false;
      if (els.workspace) els.workspace.hidden = true;
      if (els.refreshBtn) els.refreshBtn.hidden = true;
      if (els.logoutBtn) els.logoutBtn.hidden = true;
      if (els.loginError) els.loginError.textContent = "";
    }

    function setLoggedInState() {
      if (els.sessionState) els.sessionState.textContent = "Доступ открыт";
      if (els.authCard) els.authCard.hidden = true;
      if (els.workspace) els.workspace.hidden = false;
      if (els.refreshBtn) els.refreshBtn.hidden = false;
      if (els.logoutBtn) els.logoutBtn.hidden = false;
    }

    function renderOverview() {
      if (els.overviewMetrics) {
        const failedJobs = Number((((state.outbox || {}).counts || {}).failed) || 0);
        const pendingSubmissions = (state.submissions || []).filter((item) => item.status === "new" || item.status === "priority").length;
        const activeOrders = (state.orders || []).filter((item) => !["done", "archived"].includes(item.status)).length;
        const metrics = [
          [`${state.docs.length}`, "Документов в каталоге", "Живой каталог, который видит сайт"],
          [`${pendingSubmissions}`, "Нужно разобрать", "Присланные работы, требующие решения"],
          [`${activeOrders}`, "Активных заявок", "Новые, приоритетные и в работе"],
          [`${failedJobs}`, "Ошибок доставки", failedJobs ? "Есть задачи, которые требуют внимания" : "Очередь уведомлений сейчас чистая"],
        ];
        els.overviewMetrics.innerHTML = metrics
          .map(
            ([value, label, note]) =>
              `<article class="metric-card"><span class="metric-value">${escapeHtml(value)}</span><span class="metric-label">${escapeHtml(label)}</span><span class="metric-note">${escapeHtml(note)}</span></article>`
          )
          .join("");
      }

      if (els.overviewQuick) {
        const cards = [
          ["upload", "Добавить новую работу", "Загрузить файл и сразу опубликовать его в каталоге."],
          ["submissions", "Разобрать присланные", "Скачать вложения и решить, что публиковать."],
          ["catalog", "Подправить карточки", "Изменить название, описание, категории и теги."],
          ["delivery", "Проверить доставку", "Посмотреть очередь и перезапустить упавшие уведомления."],
        ];
        els.overviewQuick.innerHTML = cards
          .map(
            ([tab, title, text]) =>
              `<article class="quick-card"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p><div class="button-row" style="margin-top:14px"><button class="ghost-btn" type="button" data-open-tab="${tab}">Открыть раздел</button></div></article>`
          )
          .join("");
        els.overviewQuick.querySelectorAll("[data-open-tab]").forEach((button) => {
          button.addEventListener("click", () => togglePanel(button.dataset.openTab));
        });
      }

      if (els.overviewSystem) {
        const checks = ((state.health || {}).checks || {});
        const items = [
          ["База данных", checks.db],
          ["Админ-доступ", checks.adminAuth],
          ["Уведомления", checks.notifications],
        ];
        els.overviewSystem.innerHTML = items
          .map(([title, value]) => {
            const ok = value && value.ok !== false;
            return `<div class="system-item"><div class="system-item-top"><span class="system-item-title">${escapeHtml(title)}</span><span class="${ok ? "status-chip status-chip--ok" : "status-chip status-chip--danger"}">${ok ? "ОК" : "Проблема"}</span></div><p class="system-item-note">${escapeHtml(
              JSON.stringify(value || {}, null, 0).replace(/[{}"]/g, "").replace(/,/g, " · ") || "Нет данных"
            )}</p></div>`;
          })
          .join("");
      }

      if (els.overviewOrders) {
        const items = (state.orders || []).slice(0, 4);
        els.overviewOrders.innerHTML = items.length
          ? items
              .map((order) => {
                const [label, klass] = statusMeta("order", order.status);
                return `<article class="list-card"><div class="list-top"><div><div class="list-title">${escapeHtml(order.topic || "Без темы")}</div><div class="list-meta">${escapeHtml(order.contact || "Контакт не указан")}</div></div><span class="${klass}">${escapeHtml(label)}</span></div><div class="list-row"><span class="list-meta">${escapeHtml(order.work_type || "Тип не выбран")} · ${escapeHtml(formatShortDate(order.created_at))}</span></div></article>`;
              })
              .join("")
          : `<div class="empty-state">Пока нет заявок.</div>`;
      }

      if (els.overviewSubmissions) {
        const items = (state.submissions || []).slice(0, 4);
        els.overviewSubmissions.innerHTML = items.length
          ? items
              .map((submission) => {
                const [label, klass] = statusMeta("submission", submission.status);
                return `<article class="list-card"><div class="list-top"><div><div class="list-title">${escapeHtml(submission.title || "Без названия")}</div><div class="list-meta">${escapeHtml(submission.contact || "Контакт не указан")}</div></div><span class="${klass}">${escapeHtml(label)}</span></div><div class="list-row"><span class="list-meta">${escapeHtml(submission.subject || "Предмет не указан")} · ${escapeHtml(formatShortDate(submission.created_at))}</span></div></article>`;
              })
              .join("")
          : `<div class="empty-state">Пока никто не прислал новую работу.</div>`;
      }
    }

    function renderCatalog() {
      if (!els.catalogList) return;
      const search = String((els.catalogSearch && els.catalogSearch.value) || "").trim().toLowerCase();
      const docs = state.docs.filter((doc) => {
        if (!search) return true;
        return [doc.title, doc.catalogTitle, doc.subject, doc.category, doc.filename]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);
      });

      els.catalogList.innerHTML = docs.length
        ? docs
            .map((doc) => {
              const active = doc.file === state.selectedDocFile;
              return `<article class="list-card${active ? " is-active" : ""}" data-doc-file="${escapeHtml(doc.file)}"><div class="list-top"><div><div class="list-title">${escapeHtml(doc.catalogTitle || doc.title || doc.filename || "Документ")}</div><div class="list-meta">${escapeHtml(doc.category || "Без категории")} · ${escapeHtml(doc.subject || "Без предмета")}</div></div><span class="attachment-chip">${escapeHtml(doc.size || "Размер неизвестен")}</span></div><div class="list-row"><span class="list-meta">${escapeHtml(doc.file || "")}</span></div></article>`;
            })
            .join("")
        : `<div class="empty-state">По этому запросу ничего не найдено.</div>`;

      els.catalogList.querySelectorAll("[data-doc-file]").forEach((card) => {
        card.addEventListener("click", () => {
          state.selectedDocFile = card.dataset.docFile || "";
          renderCatalog();
          renderCatalogEditor();
        });
      });

      if (!state.selectedDocFile && docs.length) {
        state.selectedDocFile = docs[0].file;
      }
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
      if (els.catalogCategory) els.catalogCategory.innerHTML = buildOptions(state.options.categories, doc.category || "", "Выберите категорию");
      if (els.catalogSubject) els.catalogSubject.innerHTML = buildOptions(state.options.subjects, doc.subject || "", "Выберите предмет");
      if (els.catalogCourse) els.catalogCourse.innerHTML = buildOptions(state.options.courses, doc.course || "", "Курс не указан");
      if (els.catalogDocType) els.catalogDocType.value = doc.docType || "";
      if (els.catalogTags) els.catalogTags.value = Array.isArray(doc.tags) ? doc.tags.join(", ") : "";
      if (els.catalogMeta) {
        els.catalogMeta.innerHTML = `Публичная ссылка: <a href="${buildDocHref(doc.file)}" target="_blank" rel="noopener">${escapeHtml(
          buildDocHref(doc.file)
        )}</a><br/>Файл: ${escapeHtml(doc.file)}<br/>Размер: ${escapeHtml(doc.size || "—")}`;
      }
      if (els.catalogOpenBtn) els.catalogOpenBtn.href = buildDocHref(doc.file);
    }

    function renderOrders() {
      if (!els.orderList) return;
      const search = String((els.orderSearch && els.orderSearch.value) || "").trim().toLowerCase();
      const statusFilter = String((els.orderStatusFilter && els.orderStatusFilter.value) || "all");
      const orders = state.orders.filter((order) => {
        if (statusFilter !== "all" && order.status !== statusFilter) return false;
        if (!search) return true;
        return [order.topic, order.contact, order.subject, order.work_type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);
      });

      els.orderList.innerHTML = orders.length
        ? orders
            .map((order) => {
              const active = Number(order.id) === Number(state.selectedOrderId);
              const [label, klass] = statusMeta("order", order.status);
              return `<article class="list-card${active ? " is-active" : ""}" data-order-id="${order.id}"><div class="list-top"><div><div class="list-title">${escapeHtml(order.topic || "Без темы")}</div><div class="list-meta">${escapeHtml(order.contact || "Контакт не указан")}</div></div><span class="${klass}">${escapeHtml(label)}</span></div><div class="list-row"><span class="list-meta">${escapeHtml(order.work_type || "Тип не выбран")} · ${escapeHtml(order.subject || "Предмет не выбран")} · ${escapeHtml(formatShortDate(order.created_at))}</span></div></article>`;
            })
            .join("")
        : `<div class="empty-state">Заявки по этому фильтру не найдены.</div>`;

      els.orderList.querySelectorAll("[data-order-id]").forEach((card) => {
        card.addEventListener("click", () => {
          state.selectedOrderId = Number(card.dataset.orderId || 0);
          renderOrders();
          renderOrderEditor();
        });
      });

      if (!state.selectedOrderId && orders.length) {
        state.selectedOrderId = Number(orders[0].id);
      }
      renderOrderEditor();
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
      if (els.orderSummary) {
        els.orderSummary.innerHTML = `<div><div class="detail-title">${escapeHtml(order.topic || "Без темы")}</div><div class="list-meta">${escapeHtml(
          order.contact || "Контакт не указан"
        )}</div></div><span class="${statusMeta("order", order.status)[1]}">${escapeHtml(statusMeta("order", order.status)[0])}</span>`;
      }
      if (els.orderStatus) els.orderStatus.value = order.status || "new";
      if (els.orderNote) els.orderNote.value = order.manager_note || "";
      if (els.orderAttachments) {
        const attachments = Array.isArray(order.attachments) ? order.attachments : [];
        els.orderAttachments.innerHTML = attachments.length
          ? `<div class="detail-block"><h4>Файлы клиента</h4><div class="button-row">${attachments
              .map(
                (attachment) =>
                  `<button class="ghost-btn" type="button" data-download-kind="order" data-owner-id="${order.id}" data-stored-name="${escapeHtml(
                    attachment.stored_name || ""
                  )}" data-download-name="${escapeHtml(attachment.name || attachment.stored_name || "Файл")}">${escapeHtml(
                    attachment.name || attachment.stored_name || "Файл"
                  )} · ${escapeHtml(attachment.size_label || formatFileSize(attachment.size_bytes))}</button>`
              )
              .join("")}</div></div>`
          : `<div class="detail-block"><h4>Файлы клиента</h4><p>К этой заявке файлы не прикреплялись.</p></div>`;
      }
      bindAttachmentDownloads(els.orderAttachments);
    }

    function renderSubmissions() {
      if (!els.submissionList) return;
      const search = String((els.submissionSearch && els.submissionSearch.value) || "").trim().toLowerCase();
      const statusFilter = String((els.submissionStatusFilter && els.submissionStatusFilter.value) || "all");
      const submissions = state.submissions.filter((submission) => {
        if (statusFilter !== "all" && submission.status !== statusFilter) return false;
        if (!search) return true;
        return [submission.title, submission.contact, submission.subject, submission.category, submission.author_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);
      });

      els.submissionList.innerHTML = submissions.length
        ? submissions
            .map((submission) => {
              const active = Number(submission.id) === Number(state.selectedSubmissionId);
              const [label, klass] = statusMeta("submission", submission.status);
              const attachmentCount = Array.isArray(submission.attachments) ? submission.attachments.length : 0;
              return `<article class="list-card${active ? " is-active" : ""}" data-submission-id="${submission.id}"><div class="list-top"><div><div class="list-title">${escapeHtml(
                submission.title || "Без названия"
              )}</div><div class="list-meta">${escapeHtml(submission.contact || "Контакт не указан")}</div></div><span class="${klass}">${escapeHtml(label)}</span></div><div class="list-row"><span class="list-meta">${escapeHtml(
                submission.subject || "Предмет не указан"
              )} · ${attachmentCount} файл(ов) · ${escapeHtml(formatShortDate(submission.created_at))}</span></div></article>`;
            })
            .join("")
        : `<div class="empty-state">Ничего не найдено.</div>`;

      els.submissionList.querySelectorAll("[data-submission-id]").forEach((card) => {
        card.addEventListener("click", () => {
          state.selectedSubmissionId = Number(card.dataset.submissionId || 0);
          renderSubmissions();
          renderSubmissionDetail();
        });
      });

      if (!state.selectedSubmissionId && submissions.length) {
        state.selectedSubmissionId = Number(submissions[0].id);
      }
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
      const selectedStoredName = attachments[0] ? attachments[0].stored_name || "" : "";
      const [statusLabel, statusClass] = statusMeta("submission", submission.status);

      els.submissionDetail.innerHTML = `
        <div class="detail-top">
          <div>
            <div class="detail-title">${escapeHtml(submission.title || "Без названия")}</div>
            <div class="list-meta">${escapeHtml(submission.contact || "Контакт не указан")} · ${escapeHtml(formatDate(submission.created_at))}</div>
          </div>
          <span class="${statusClass}">${escapeHtml(statusLabel)}</span>
        </div>

        <div class="detail-grid" style="margin-top:18px">
          <div class="detail-chip">${escapeHtml(submission.subject || "Предмет не указан")}</div>
          <div class="detail-chip">${escapeHtml(submission.category || "Категория не указана")}</div>
          <div class="detail-chip">${escapeHtml(submission.doc_type || "Тип не указан")}</div>
          <div class="detail-chip">${escapeHtml(submission.course || "Курс не указан")}</div>
        </div>

        <div class="detail-block">
          <h4>Описание автора</h4>
          <p>${escapeHtml(submission.description || submission.comment || "Описание не оставили.")}</p>
        </div>

        <div class="detail-block">
          <h4>Файлы</h4>
          <div class="attachment-list">${attachments.length ? attachments
            .map(
              (attachment) =>
                `<button class="ghost-btn" type="button" data-download-kind="library" data-owner-id="${submission.id}" data-stored-name="${escapeHtml(
                  attachment.stored_name || ""
                )}" data-download-name="${escapeHtml(attachment.name || attachment.stored_name || "Файл")}">${escapeHtml(
                  attachment.name || attachment.stored_name || "Файл"
                )} · ${escapeHtml(attachment.size_label || formatFileSize(attachment.size_bytes))}</button>`
            )
            .join("") : "<p>Файлы не прикреплены.</p>"}</div>
        </div>

        <div class="detail-block">
          <h4>Решение по работе</h4>
          <div class="form-grid">
            <label class="field">
              <span>Статус</span>
              <select id="submissionStatusEditor">${SUBMISSION_STATUS_OPTIONS.map(
                ([value, label]) => `<option value="${value}"${value === (submission.status || "new") ? " selected" : ""}>${label}</option>`
              ).join("")}</select>
            </label>
            <label class="field">
              <span>Какой файл публиковать</span>
              <select id="submissionPublishStored">${attachments
                .map(
                  (attachment) =>
                    `<option value="${escapeHtml(attachment.stored_name || "")}"${
                      (attachment.stored_name || "") === selectedStoredName ? " selected" : ""
                    }>${escapeHtml(attachment.name || attachment.stored_name || "Файл")}</option>`
                )
                .join("")}</select>
            </label>
            <label class="field field--full">
              <span>Заметка для себя</span>
              <textarea id="submissionManagerNote" rows="4" placeholder="Например: хороший документ, проверить формат, опубликовать после правок">${escapeHtml(
                submission.manager_note || ""
              )}</textarea>
            </label>
          </div>
          <div class="button-row" style="margin-top:14px">
            <button class="primary-btn" type="button" id="submissionSaveBtn">Сохранить статус</button>
          </div>
        </div>

        <div class="detail-block">
          <h4>Публикация в каталог</h4>
          <div class="form-grid">
            <label class="field field--full">
              <span>Название карточки</span>
              <input id="publishTitle" type="text" value="${escapeHtml(submission.title || "")}" />
            </label>
            <label class="field field--full">
              <span>Описание карточки</span>
              <textarea id="publishDescription" rows="4">${escapeHtml(submission.description || "")}</textarea>
            </label>
            <label class="field">
              <span>Категория</span>
              <select id="publishCategory">${buildOptions(state.options.categories, submission.category || "", "Выберите категорию")}</select>
            </label>
            <label class="field">
              <span>Предмет</span>
              <select id="publishSubject">${buildOptions(state.options.subjects, submission.subject || "", "Выберите предмет")}</select>
            </label>
            <label class="field">
              <span>Курс</span>
              <select id="publishCourse">${buildOptions(state.options.courses, submission.course || "", "Курс не указан")}</select>
            </label>
            <label class="field">
              <span>Тип документа</span>
              <input id="publishDocType" type="text" value="${escapeHtml(submission.doc_type || "")}" />
            </label>
            <label class="field field--full">
              <span>Теги через запятую</span>
              <input id="publishTags" type="text" value="${escapeHtml(Array.isArray(submission.tags) ? submission.tags.join(", ") : "")}" />
            </label>
          </div>
          <div class="button-row" style="margin-top:14px">
            <button class="primary-btn" type="button" id="submissionPublishBtn">Опубликовать в каталог</button>
            <a class="ghost-btn" href="https://t.me/academicsaloon" target="_blank" rel="noopener">Открыть Telegram</a>
          </div>
          <p class="form-note" id="submissionStatusNote">Антивирус: ${escapeHtml(antivirus.status || "нет данных")}.</p>
        </div>
      `;

      bindAttachmentDownloads(els.submissionDetail);

      const saveBtn = document.getElementById("submissionSaveBtn");
      const publishBtn = document.getElementById("submissionPublishBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
          const status = document.getElementById("submissionStatusEditor");
          const note = document.getElementById("submissionManagerNote");
          try {
            await apiJson("/api/admin/library-submissions", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: submission.id,
                updates: {
                  status: status ? status.value : submission.status,
                  manager_note: note ? note.value : "",
                },
              }),
            });
            showToast("Статус работы сохранён");
            await refreshAll();
          } catch (error) {
            showToast(error.message || "Не удалось сохранить статус", "error");
          }
        });
      }
      if (publishBtn) {
        publishBtn.addEventListener("click", async () => {
          const stored = document.getElementById("submissionPublishStored");
          const note = document.getElementById("submissionManagerNote");
          try {
            const response = await apiJson("/api/admin/library-submissions/publish", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: submission.id,
                stored: stored ? stored.value : "",
                manager_note: note ? note.value : "",
                doc: {
                  title: (document.getElementById("publishTitle") || {}).value || "",
                  description: (document.getElementById("publishDescription") || {}).value || "",
                  category: (document.getElementById("publishCategory") || {}).value || "",
                  subject: (document.getElementById("publishSubject") || {}).value || "",
                  course: (document.getElementById("publishCourse") || {}).value || "",
                  docType: (document.getElementById("publishDocType") || {}).value || "",
                  tags: (document.getElementById("publishTags") || {}).value || "",
                },
              }),
            });
            showToast("Работа опубликована в каталог");
            await refreshAll();
            state.selectedDocFile = (response.doc || {}).file || state.selectedDocFile;
            togglePanel("catalog");
            renderCatalog();
            if ((response.doc || {}).file) {
              window.open(buildDocHref(response.doc.file), "_blank", "noopener");
            }
          } catch (error) {
            showToast(error.message || "Не удалось опубликовать работу", "error");
          }
        });
      }
    }

    function renderDelivery() {
      const counts = ((state.outbox || {}).counts || {});
      const metrics = [
        [counts.pending || 0, "Ожидают"],
        [counts.processing || 0, "В работе"],
        [counts.failed || 0, "С ошибкой"],
        [counts.done || 0, "Выполнено"],
        [(state.outbox || {}).staleUploadSessions || 0, "Протухших загрузок"],
      ];
      if (els.deliveryMetrics) {
        els.deliveryMetrics.innerHTML = metrics
          .map(
            ([value, label]) =>
              `<article class="metric-card"><span class="metric-value">${escapeHtml(String(value))}</span><span class="metric-label">${escapeHtml(label)}</span></article>`
          )
          .join("");
      }

      if (els.deliveryJobs) {
        const jobs = (state.outbox && state.outbox.recentJobs) || [];
        els.deliveryJobs.innerHTML = jobs.length
          ? jobs
              .map((job) => {
                const [label, klass] = statusMeta("job", job.status);
                return `<article class="list-card"><div class="list-top"><div><div class="list-title">${escapeHtml(job.task_type || "job")}</div><div class="list-meta">ID ${job.id} · попыток ${job.attempts}/${job.max_attempts} · ${escapeHtml(
                  formatShortDate(job.updated_at)
                )}</div></div><span class="${klass}">${escapeHtml(label)}</span></div>${
                  job.last_error ? `<div class="detail-block"><p>${escapeHtml(job.last_error)}</p></div>` : ""
                }<div class="button-row" style="margin-top:12px">${
                  job.status === "failed"
                    ? `<button class="ghost-btn" type="button" data-retry-job="${job.id}">Повторить</button>`
                    : ""
                }</div></article>`;
              })
              .join("")
          : `<div class="empty-state">Очередь пока пуста.</div>`;
        els.deliveryJobs.querySelectorAll("[data-retry-job]").forEach((button) => {
          button.addEventListener("click", async () => {
            try {
              await apiJson("/api/admin/outbox/retry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId: Number(button.dataset.retryJob) }),
              });
              showToast("Задача возвращена в очередь");
              await refreshAll();
            } catch (error) {
              showToast(error.message || "Не удалось повторить задачу", "error");
            }
          });
        });
      }

      if (els.deliveryTech) {
        const uploadSessions = (state.outbox && state.outbox.uploadSessions) || {};
        const checks = ((state.health || {}).checks || {});
        const rows = [
          ["Upload sessions", Object.keys(uploadSessions).length ? JSON.stringify(uploadSessions) : "Нет данных"],
          ["Идемпотентность", `${(state.outbox || {}).idempotencyKeys || 0} активных ключей`],
          ["Telegram Forum", JSON.stringify((checks.notifications || {}).telegramForum || false)],
          ["Email", JSON.stringify((checks.notifications || {}).email || false)],
        ];
        els.deliveryTech.innerHTML = rows
          .map(
            ([title, note]) =>
              `<div class="system-item"><div class="system-item-top"><span class="system-item-title">${escapeHtml(title)}</span></div><p class="system-item-note">${escapeHtml(note)}</p></div>`
          )
          .join("");
      }
    }

    function bindAttachmentDownloads(container) {
      if (!container) return;
      container.querySelectorAll("[data-download-kind]").forEach((button) => {
        button.addEventListener("click", async () => {
          const kind = button.dataset.downloadKind;
          const ownerId = button.dataset.ownerId;
          const storedName = button.dataset.storedName;
          const label = button.dataset.downloadName || "attachment";
          try {
            const file = await apiBlob(
              `/api/admin/attachment?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(ownerId)}&stored=${encodeURIComponent(storedName)}`
            );
            const url = URL.createObjectURL(file.blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = file.filename || label;
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

    async function refreshAll() {
      if (!state.token) return;
      if (els.sessionState) els.sessionState.textContent = "Обновляем данные…";
      try {
        const [docs, orders, submissions, analytics, outbox, health] = await Promise.all([
          apiJson("/api/admin/docs"),
          apiJson("/api/admin/orders"),
          apiJson("/api/admin/library-submissions"),
          apiJson("/api/admin/analytics"),
          apiJson("/api/admin/outbox?limit=20"),
          apiJson("/api/health/ready"),
        ]);
        state.docs = docs.docs || [];
        state.orders = orders.orders || [];
        state.submissions = submissions.submissions || [];
        state.analytics = analytics;
        state.outbox = outbox;
        state.health = health;
        collectOptions();
        renderOverview();
        renderCatalog();
        renderOrders();
        renderSubmissions();
        renderDelivery();
        setLoggedInState();
      } catch (error) {
        showToast(error.message || "Не удалось обновить данные", "error");
        if (/unauthorized|invalid/i.test(String(error.message || ""))) {
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
        setLoggedInState();
        await refreshAll();
      } catch (error) {
        setLoggedOutState();
      }
    }

    if (els.loginForm) {
      els.loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = String((els.password && els.password.value) || "").trim();
        if (!password) {
          if (els.loginError) els.loginError.textContent = "Введите пароль администратора.";
          return;
        }
        if (els.loginBtn) {
          els.loginBtn.disabled = true;
          els.loginBtn.textContent = "Проверяем…";
        }
        if (els.loginError) els.loginError.textContent = "";
        try {
          const response = await apiJson("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          });
          state.token = response.token || "";
          sessionStorage.setItem(TOKEN_KEY, state.token);
          if (els.password) els.password.value = "";
          await verifySession();
          showToast("Вход выполнен");
        } catch (error) {
          if (els.loginError) els.loginError.textContent = error.message || "Не удалось войти.";
        } finally {
          if (els.loginBtn) {
            els.loginBtn.disabled = false;
            els.loginBtn.textContent = "Войти в админку";
          }
        }
      });
    }

    if (els.logoutBtn) {
      els.logoutBtn.addEventListener("click", async () => {
        try {
          await apiJson("/api/admin/logout", { method: "POST" });
        } catch (error) {}
        setLoggedOutState();
        showToast("Вы вышли из админки");
      });
    }

    if (els.refreshBtn) {
      els.refreshBtn.addEventListener("click", async () => {
        await refreshAll();
        showToast("Данные обновлены");
      });
    }

    els.tabs.forEach((button) => {
      button.addEventListener("click", () => togglePanel(button.dataset.tab || "overview"));
    });

    if (els.catalogSearch) els.catalogSearch.addEventListener("input", renderCatalog);
    if (els.orderSearch) els.orderSearch.addEventListener("input", renderOrders);
    if (els.orderStatusFilter) els.orderStatusFilter.addEventListener("change", renderOrders);
    if (els.submissionSearch) els.submissionSearch.addEventListener("input", renderSubmissions);
    if (els.submissionStatusFilter) els.submissionStatusFilter.addEventListener("change", renderSubmissions);

    if (els.catalogEditor) {
      els.catalogEditor.addEventListener("submit", async (event) => {
        event.preventDefault();
        const doc = state.docs.find((item) => item.file === state.selectedDocFile);
        if (!doc) return;
        const updates = {
          title: els.catalogTitle ? els.catalogTitle.value.trim() : "",
          description: els.catalogDescription ? els.catalogDescription.value.trim() : "",
          category: els.catalogCategory ? els.catalogCategory.value : "",
          subject: els.catalogSubject ? els.catalogSubject.value : "",
          course: els.catalogCourse ? els.catalogCourse.value : "",
          docType: els.catalogDocType ? els.catalogDocType.value.trim() : "",
          tags: String((els.catalogTags && els.catalogTags.value) || "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
          catalogTitle: els.catalogTitle ? els.catalogTitle.value.trim() : "",
          catalogDescription: els.catalogDescription ? els.catalogDescription.value.trim() : "",
        };
        try {
          await apiJson("/api/admin/docs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: doc.file, updates }),
          });
          if (els.catalogStatus) els.catalogStatus.textContent = "Изменения сохранены.";
          showToast("Карточка документа обновлена");
          await refreshAll();
        } catch (error) {
          if (els.catalogStatus) els.catalogStatus.textContent = error.message || "Не удалось сохранить документ.";
          showToast(error.message || "Не удалось сохранить документ", "error");
        }
      });
    }

    if (els.catalogDeleteBtn) {
      els.catalogDeleteBtn.addEventListener("click", async () => {
        const doc = state.docs.find((item) => item.file === state.selectedDocFile);
        if (!doc) return;
        const ok = window.confirm(`Удалить документ «${doc.catalogTitle || doc.title || doc.filename}» из каталога?`);
        if (!ok) return;
        try {
          await apiJson("/api/admin/docs", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: doc.file }),
          });
          showToast("Документ удалён");
          state.selectedDocFile = "";
          await refreshAll();
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
          await apiJson("/api/admin/orders", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: order.id,
              updates: {
                status: els.orderStatus ? els.orderStatus.value : order.status,
                manager_note: els.orderNote ? els.orderNote.value : "",
              },
            }),
          });
          if (els.orderStatusNote) els.orderStatusNote.textContent = "Статус заявки сохранён.";
          showToast("Заявка обновлена");
          await refreshAll();
        } catch (error) {
          if (els.orderStatusNote) els.orderStatusNote.textContent = error.message || "Не удалось сохранить заявку.";
          showToast(error.message || "Не удалось сохранить заявку", "error");
        }
      });
    }

    if (els.deliveryCleanupBtn) {
      els.deliveryCleanupBtn.addEventListener("click", async () => {
        try {
          await apiJson("/api/admin/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          showToast("Очередь и временные хвосты очищены");
          await refreshAll();
        } catch (error) {
          showToast(error.message || "Не удалось выполнить очистку", "error");
        }
      });
    }

    if (els.uploadFileInput) {
      els.uploadFileInput.addEventListener("change", () => {
        state.uploadFile = els.uploadFileInput.files && els.uploadFileInput.files[0] ? els.uploadFileInput.files[0] : null;
        if (els.uploadFileInfo) {
          els.uploadFileInfo.textContent = state.uploadFile
            ? `${state.uploadFile.name} · ${formatFileSize(state.uploadFile.size)}`
            : "Файл ещё не выбран";
        }
        if (state.uploadFile && els.uploadTitle && !els.uploadTitle.value.trim()) {
          els.uploadTitle.value = state.uploadFile.name.replace(/\.[^.]+$/, "");
        }
      });
    }

    if (els.uploadDropzone) {
      ["dragenter", "dragover"].forEach((eventName) => {
        els.uploadDropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          els.uploadDropzone.classList.add("is-drag");
        });
      });
      ["dragleave", "drop"].forEach((eventName) => {
        els.uploadDropzone.addEventListener(eventName, (event) => {
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
          showToast("Сначала выберите файл для загрузки.", "error");
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
        formData.append("title", (els.uploadTitle && els.uploadTitle.value.trim()) || state.uploadFile.name.replace(/\.[^.]+$/, ""));
        formData.append("description", (els.uploadDescription && els.uploadDescription.value.trim()) || "");
        formData.append("category", (els.uploadCategory && els.uploadCategory.value) || "");
        formData.append("subject", (els.uploadSubject && els.uploadSubject.value) || "");
        formData.append("course", (els.uploadCourse && els.uploadCourse.value) || "");
        formData.append("docType", (els.uploadDocType && els.uploadDocType.value.trim()) || "");
        formData.append("tags", (els.uploadTags && els.uploadTags.value.trim()) || "");

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
          if (els.uploadStatus) els.uploadStatus.textContent = "Не удалось загрузить файл.";
          showToast("Ошибка сети при загрузке файла", "error");
        };
        xhr.onload = async () => {
          let payload = {};
          try {
            payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          } catch (error) {
            payload = {};
          }
          if (xhr.status >= 200 && xhr.status < 300 && payload.ok !== false) {
            showToast("Документ загружен в каталог");
            if (els.uploadStatus) {
              const href = buildDocHref((payload.doc || {}).file || "");
              els.uploadStatus.innerHTML = `Готово. <a href="${href}" target="_blank" rel="noopener">Открыть публичную карточку</a>`;
            }
            state.uploadFile = null;
            if (els.uploadFileInput) els.uploadFileInput.value = "";
            if (els.uploadFileInfo) els.uploadFileInfo.textContent = "Файл ещё не выбран";
            if (els.uploadTitle) els.uploadTitle.value = "";
            if (els.uploadDescription) els.uploadDescription.value = "";
            if (els.uploadDocType) els.uploadDocType.value = "";
            if (els.uploadTags) els.uploadTags.value = "";
            if (els.uploadProgressFill) els.uploadProgressFill.style.width = "100%";
            await refreshAll();
          } else {
            const message = normalizeError(payload, "Не удалось загрузить документ.");
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

    togglePanel(state.activeTab);
    verifySession();
  }

  initAdminApp();
  document.addEventListener("astro:after-swap", initAdminApp);
})();
