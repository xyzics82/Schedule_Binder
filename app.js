(function () {
  "use strict";

  const STORE_KEY = "life-binder-web-state-v1";
  const AUTH_STORE_KEY = "life-binder-auth-v1";
  const SUPABASE_URL = "https://ktchyquqqmvvsmnqpurm.supabase.co";
  const SUPABASE_KEY = "sb_publishable_kdwfBTunk1RQxbRVcaXKYg_5M2zlxdH";
  const LOGIN_DOMAIN = "binder.local";
  const REMOTE_SAVE_DELAY = 800;
  const app = document.getElementById("app");

  const categories = [
    { id: "mainWork", name: "주업무", color: "#f2c94c" },
    { id: "supportWork", name: "보조업무", color: "#e85d8f" },
    { id: "faithHome", name: "신앙/가정/봉사", color: "#2ec27e" },
    { id: "selfDev", name: "자기개발", color: "#4dabf7" },
    { id: "network", name: "휴먼 네트워크", color: "#ff922b" }
  ];

  const DAY_START_HOUR = 5;
  const DAY_END_HOUR = 24;
  const SNAP_MINUTES = 15;

  const checkStatuses = [
    { id: "open", symbol: "", label: "\ubbf8\uc815" },
    { id: "done", symbol: "v", label: "\uc644\ub8cc" },
    { id: "progress", symbol: "->", label: "\uc9c4\ud589\uc911" },
    { id: "cancelled", symbol: "-x-", label: "\ucde8\uc18c" },
    { id: "postponed", symbol: "=", label: "\uc5f0\uae30/\uc704\uc784" }
  ];

  const shareFormats = [
    { id: "essay", label: "브런치/Medium", tone: "차분한 에세이" },
    { id: "social", label: "인스타/Threads", tone: "짧은 사진 글" },
    { id: "professional", label: "LinkedIn", tone: "배운 점 중심" },
    { id: "newsletter", label: "Substack", tone: "편지형 글" }
  ];

  const navItems = [
    {
      id: "week",
      label: "주간",
      icon: "W",
      tooltip: "주간 작성 방법: 먼저 Plan으로 계획 시간을 만들고, Do에서 계획을 눌러 실행을 작성합니다. 실행을 저장하면 Do가 크게 보이고 Plan은 좁은 시간 표시로 옆에 붙습니다."
    },
    { id: "today", label: "오늘", icon: "T" },
    { id: "month", label: "월간", icon: "M" },
    { id: "goals", label: "목표", icon: "G" },
    { id: "projects", label: "프로젝트", icon: "P" },
    { id: "binder", label: "서브 바인더", icon: "B" },
    { id: "review", label: "리뷰", icon: "R" },
    { id: "stats", label: "통계", icon: "S" },
    { id: "guide", label: "가이드", icon: "?" }
  ];

  let state = loadState();
  let authSession = loadAuthSession();
  let authStatus = "loading";
  let authError = "";
  let authMessage = "";
  let syncStatus = "";
  let remoteSaveTimer = null;
  let remoteSavePromise = Promise.resolve();
  let drawState = null;
  let editDragState = null;
  let suppressSegmentClick = null;
  let schedulePopup = null;
  let planCopyPicker = null;
  let monthEditorDate = null;

  function todayISO() {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseISO(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(iso, count) {
    const date = parseISO(iso);
    date.setDate(date.getDate() + count);
    return toISO(date);
  }

  function addMonths(iso, count) {
    const date = parseISO(iso);
    date.setMonth(date.getMonth() + count);
    return toISO(date);
  }

  function startOfWeek(iso) {
    const date = parseISO(iso);
    const day = date.getDay();
    date.setDate(date.getDate() - day);
    return toISO(date);
  }

  function endOfWeek(iso) {
    return addDays(startOfWeek(iso), 6);
  }

  function formatDate(iso, options) {
    return new Intl.DateTimeFormat("ko-KR", options || {
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(parseISO(iso));
  }

  function monthTitle(iso) {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long"
    }).format(parseISO(iso));
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function attr(value) {
    return esc(value).replace(/`/g, "&#096;");
  }

  function minutesFromTime(time) {
    const [h, m] = String(time || "00:00").split(":").map(Number);
    return h * 60 + m;
  }

  function timeFromMinutes(minutes) {
    const safe = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function formatClock(time) {
    return timeFromMinutes(minutesFromTime(normalizeTimeInput(time, "00:00")));
  }

  function formatTimeRange(start, end) {
    return `${formatClock(start)}-${formatClock(end)}`;
  }

  function snapMinutes(minutes) {
    return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
  }

  function clampDayMinutes(minutes) {
    return Math.max(DAY_START_HOUR * 60, Math.min(DAY_END_HOUR * 60, minutes));
  }

  function linePercent(time) {
    const minutes = clampDayMinutes(minutesFromTime(time));
    const start = DAY_START_HOUR * 60;
    const total = (DAY_END_HOUR - DAY_START_HOUR) * 60;
    return ((minutes - start) / total) * 100;
  }

  function durationPercent(start, end, minimum = 3.2) {
    return Math.max(minimum, linePercent(end) - linePercent(start));
  }

  function minutesToText(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return `${h}시간 ${m}분`;
    if (h) return `${h}시간`;
    return `${m}분`;
  }

  function multiline(value) {
    return esc(value).replace(/\r\n|\r|\n/g, "<br>");
  }

  function richMultiline(value) {
    return esc(value)
      .replace(/~~(.+?)~~/g, "<s>$1</s>")
      .replace(/\r\n|\r|\n/g, "<br>");
  }

  function autoGrowTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function bindAutoGrowTextarea(textarea) {
    autoGrowTextarea(textarea);
    textarea.addEventListener("input", () => autoGrowTextarea(textarea));
  }

  function isValidISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    return toISO(parseISO(value)) === value;
  }

  function categoryById(id) {
    return categories.find((item) => item.id === normalizeCategoryId(id)) || categories[0];
  }

  function normalizeCategoryId(id) {
    if (categories.some((item) => item.id === id)) return id;
    const legacyMap = {
      work: "mainWork",
      study: "selfDev",
      health: "selfDev",
      relation: "network",
      rest: "faithHome",
      admin: "supportWork"
    };
    return legacyMap[id] || "mainWork";
  }

  function goalById(id) {
    return state.goals.find((item) => item.id === id);
  }

  function projectById(id) {
    return state.projects.find((item) => item.id === id);
  }

  function normalizeCheckStatus(item) {
    const status = typeof item === "string" ? item : item?.status;
    if (status === "delegated") return "postponed";
    if (checkStatuses.some((entry) => entry.id === status)) return status;
    return item?.done ? "done" : "open";
  }

  function statusById(id) {
    return checkStatuses.find((entry) => entry.id === id) || checkStatuses[0];
  }

  function nextCheckStatus(id) {
    const currentIndex = checkStatuses.findIndex((entry) => entry.id === normalizeCheckStatus(id));
    return checkStatuses[(currentIndex + 1) % checkStatuses.length].id;
  }

  function shareFormatById(id) {
    return shareFormats.find((format) => format.id === id) || shareFormats[0];
  }

  function checkIsDone(item) {
    return normalizeCheckStatus(item) === "done";
  }

  function normalizeDailyCheck(item) {
    const status = normalizeCheckStatus(item);
    return {
      ...item,
      status,
      done: status === "done"
    };
  }

  function checkStatusClass(item) {
    return `is-status-${normalizeCheckStatus(item)}`;
  }

  function renderStatusSelect(className, attrsText, currentStatus) {
    const normalized = normalizeCheckStatus(currentStatus);
    const status = statusById(normalized);
    return `<button type="button" class="status-toggle ${className} is-${attr(normalized)}" ${attrsText} data-status="${attr(normalized)}" title="${attr(status.label)}" aria-label="${attr(status.label)}"><span class="status-icon" aria-hidden="true">${statusIconMarkup(normalized)}</span></button>`;
  }

  function statusIconMarkup(status) {
    const normalized = normalizeCheckStatus(status);
    const base = `class="status-svg" viewBox="0 0 24 24" focusable="false"`;
    if (normalized === "done") {
      return `<svg ${base}><path d="M5 12.5 9.2 16.5 19 7.5"/></svg>`;
    }
    if (normalized === "progress") {
      return `<svg ${base}><path d="M4.5 12h13"/><path d="M12.5 6.8 17.7 12l-5.2 5.2"/></svg>`;
    }
    if (normalized === "cancelled") {
      return `<svg ${base}><path d="M7 7 17 17"/><path d="M17 7 7 17"/></svg>`;
    }
    if (normalized === "postponed") {
      return `<svg ${base}><path d="M6 8h12"/><path d="M6 16h12"/><path d="M15 5l3 3-3 3"/></svg>`;
    }
    return "";
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return normalizeState(parsed);
      }
    } catch (error) {
      console.warn("저장 데이터를 불러오지 못했습니다.", error);
    }
    return createSeedState();
  }

  function loadAuthSession() {
    try {
      const raw = localStorage.getItem(AUTH_STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("Saved login could not be loaded.", error);
      return null;
    }
  }

  function saveAuthSession(session) {
    authSession = session;
    localStorage.setItem(AUTH_STORE_KEY, JSON.stringify(session));
  }

  function clearAuthSession() {
    authSession = null;
    localStorage.removeItem(AUTH_STORE_KEY);
    if (remoteSaveTimer) {
      window.clearTimeout(remoteSaveTimer);
      remoteSaveTimer = null;
    }
  }

  function loginIdToEmail(value) {
    const clean = String(value || "").trim().toLowerCase();
    if (!clean) return "";
    return clean.includes("@") ? clean : `${clean}@${LOGIN_DOMAIN}`;
  }

  function displayLoginId() {
    const email = authSession?.user?.email || "";
    return email.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -(`@${LOGIN_DOMAIN}`).length) : email;
  }

  function normalizeAuthSession(data, previousSession = null) {
    const expiresAt = data.expires_at || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || previousSession?.refresh_token || "",
      expires_at: expiresAt,
      user: data.user || previousSession?.user || null
    };
  }

  async function signIn(loginId, password) {
    const email = loginIdToEmail(loginId);
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();
    saveAuthSession(normalizeAuthSession(data));
  }

  async function refreshAuthSession() {
    if (!authSession?.refresh_token) {
      throw new Error("No refresh token.");
    }
    const previousSession = authSession;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: authSession.refresh_token })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();
    saveAuthSession(normalizeAuthSession(data, previousSession));
  }

  async function ensureAuthSession() {
    if (!authSession?.access_token) {
      throw new Error("Login required.");
    }
    if (authSession.expires_at && authSession.expires_at < Math.floor(Date.now() / 1000) + 60) {
      await refreshAuthSession();
    }
    return authSession;
  }

  async function supabaseRequest(path, options = {}, retry = true) {
    const { auth = true, headers = {}, ...fetchOptions } = options;
    if (auth) await ensureAuthSession();
    const requestHeaders = {
      apikey: SUPABASE_KEY,
      ...headers
    };
    if (authSession?.access_token && auth) {
      requestHeaders.Authorization = `Bearer ${authSession.access_token}`;
    }
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...fetchOptions,
      headers: requestHeaders
    });
    if (response.status === 401 && retry && authSession?.refresh_token) {
      await refreshAuthSession();
      return supabaseRequest(path, options, false);
    }
    if (!response.ok) {
      throw new Error(await response.text());
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function saveLocalState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function setSyncStatus(value) {
    syncStatus = value;
    const element = document.querySelector("[data-sync-status]");
    if (element) element.textContent = value;
  }

  function queueRemoteSave() {
    if (authStatus !== "signed-in" || !authSession?.user?.id) return;
    setSyncStatus("저장 중...");
    if (remoteSaveTimer) window.clearTimeout(remoteSaveTimer);
    remoteSaveTimer = window.setTimeout(() => {
      remoteSaveTimer = null;
      remoteSavePromise = remoteSavePromise
        .catch(() => {})
        .then(() => saveRemoteStateNow("저장됨"));
    }, REMOTE_SAVE_DELAY);
  }

  async function saveRemoteStateNow(doneMessage = "저장됨") {
    if (!authSession?.user?.id) return;
    try {
      await supabaseRequest("/rest/v1/app_states", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({
          user_id: authSession.user.id,
          state,
          updated_at: new Date().toISOString()
        })
      });
      setSyncStatus(doneMessage);
    } catch (error) {
      console.error("Remote save failed.", error);
      setSyncStatus("저장 실패");
    }
  }

  async function loadRemoteState() {
    if (!authSession?.user?.id) return;
    setSyncStatus("불러오는 중...");
    const userId = encodeURIComponent(authSession.user.id);
    const rows = await supabaseRequest(`/rest/v1/app_states?select=state&user_id=eq.${userId}&limit=1`, {
      headers: { Accept: "application/json" }
    });
    if (Array.isArray(rows) && rows[0]?.state) {
      state = normalizeState(rows[0].state);
      saveLocalState();
      setSyncStatus("불러옴");
      return;
    }
    saveLocalState();
    await saveRemoteStateNow("초기 저장됨");
  }

  async function initializeApp() {
    if (!authSession?.access_token) {
      authStatus = "signed-out";
      render();
      return;
    }
    authStatus = "loading";
    authMessage = "로그인 확인 중...";
    render();
    try {
      await ensureAuthSession();
      await loadRemoteState();
      authStatus = "signed-in";
      authMessage = "";
      authError = "";
      render();
    } catch (error) {
      console.warn("Stored login expired.", error);
      clearAuthSession();
      authStatus = "signed-out";
      authMessage = "";
      authError = "다시 로그인해 주세요.";
      render();
    }
  }

  function normalizeState(next) {
    return {
      activeView: next.activeView === "paper" ? "week" : (next.activeView || "week"),
      currentDate: next.currentDate || todayISO(),
      goals: Array.isArray(next.goals) ? next.goals : [],
      projects: Array.isArray(next.projects) ? next.projects : [],
      tasks: Array.isArray(next.tasks) ? next.tasks.map(normalizeTask) : [],
      blocks: Array.isArray(next.blocks) ? next.blocks.map(normalizeBlock) : [],
      notes: Array.isArray(next.notes) ? next.notes : [],
      reviews: normalizeReviews(next.reviews),
      weekDrawMode: next.weekDrawMode || "plan",
      todayDetailBlockId: next.todayDetailBlockId || ""
    };
  }

  function normalizeTask(task) {
    const status = normalizeCheckStatus(task);
    return {
      ...task,
      weekStart: startOfWeek(task.weekStart || task.dueDate || todayISO()),
      scope: task.scope || "work",
      status,
      done: status === "done"
    };
  }

  function normalizeReviews(reviews) {
    const source = reviews || {};
    const daily = {};
    Object.entries(source.daily || {}).forEach(([date, log]) => {
      daily[date] = {
        ...log,
        top: Array.isArray(log?.top) ? log.top : ["", "", ""],
        text: log?.text || "",
        checks: Array.isArray(log?.checks) ? log.checks.map(normalizeDailyCheck) : [],
        photos: Array.isArray(log?.photos) ? log.photos : [],
        shareDraft: log?.shareDraft || "",
        shareFormat: shareFormatById(log?.shareFormat).id
      };
    });
    return {
      daily,
      weekly: source.weekly || {}
    };
  }

  function normalizeBlock(block) {
    const actualText = block.actualText || "";
    const hasActual = Boolean(actualText.trim() || block.actualDone || block.actualStart || block.actualEnd || block.actualOnly);
    return {
      ...block,
      categoryId: normalizeCategoryId(block.categoryId),
      actualCategoryId: normalizeCategoryId(block.actualCategoryId || block.categoryId),
      actualText,
      actualStart: block.actualStart || (hasActual ? block.start : ""),
      actualEnd: block.actualEnd || (hasActual ? block.end : ""),
      actualDone: Boolean(block.actualDone || hasActual),
      actualOnly: Boolean(block.actualOnly),
      cancelled: Boolean(block.cancelled),
      cancelMemo: block.cancelMemo || "",
      memoText: block.memoText || "",
      photos: Array.isArray(block.photos) ? block.photos : []
    };
  }

  function createSeedState() {
    const today = todayISO();
    const tomorrow = addDays(today, 1);
    const weekStart = startOfWeek(today);
    const goalA = uid("goal");
    const goalB = uid("goal");
    const projectA = uid("project");
    const projectB = uid("project");
    return {
      activeView: "week",
      currentDate: today,
      weekDrawMode: "plan",
      todayDetailBlockId: "",
      goals: [
        {
          id: goalA,
          title: "시간 사용을 보이게 만들기",
          category: "성장",
          description: "매일 기록하고 주간 리뷰로 다음 행동을 정한다.",
          endDate: addDays(today, 90),
          status: "active"
        },
        {
          id: goalB,
          title: "건강 루틴 회복",
          category: "건강",
          description: "수면, 운동, 식사를 주간 단위로 관리한다.",
          endDate: addDays(today, 60),
          status: "active"
        }
      ],
      projects: [
        {
          id: projectA,
          goalId: goalA,
          title: "Life Binder MVP 만들기",
          description: "목표, 시간, 리뷰, 노트를 연결하는 첫 버전.",
          dueDate: addDays(today, 14),
          status: "active"
        },
        {
          id: projectB,
          goalId: goalB,
          title: "주 3회 운동 루틴",
          description: "지속 가능한 운동 시간을 확보한다.",
          dueDate: addDays(today, 30),
          status: "active"
        }
      ],
      tasks: [
        {
          id: uid("task"),
          projectId: projectA,
          goalId: goalA,
          title: "이번 주 목표 3개 정리",
          dueDate: today,
          weekStart,
          scope: "work",
          priority: "high",
          done: false
        },
        {
          id: uid("task"),
          projectId: projectB,
          goalId: goalB,
          title: "저녁 산책 30분",
          dueDate: today,
          weekStart,
          scope: "personal",
          priority: "normal",
          done: false
        }
      ],
      blocks: [
        {
          id: uid("block"),
          projectId: projectA,
          goalId: goalA,
          title: "주간 계획 작성",
          date: today,
          start: "09:00",
          end: "10:00",
          categoryId: "mainWork",
          actualCategoryId: "mainWork",
          status: "planned",
          actualStart: "09:10",
          actualEnd: "09:55",
          actualText: "45분 집중, 다음 작업 목록 정리",
          actualDone: true,
          actualOnly: false,
          cancelled: false,
          cancelMemo: "",
          memoText: "다음에는 계획보다 10분 늦게 시작한 이유를 확인하기.",
          photos: []
        },
        {
          id: uid("block"),
          projectId: projectB,
          goalId: goalB,
          title: "운동 루틴",
          date: tomorrow,
          start: "19:00",
          end: "19:40",
          categoryId: "selfDev",
          actualCategoryId: "selfDev",
          status: "planned",
          actualStart: "",
          actualEnd: "",
          actualText: "",
          actualDone: false,
          actualOnly: false,
          cancelled: false,
          cancelMemo: "",
          memoText: "",
          photos: []
        }
      ],
      notes: [
        {
          id: uid("note"),
          projectId: projectA,
          title: "앱 설계 원칙",
          source: "idea",
          tags: ["MVP", "리뷰"],
          body: "일정 입력보다 목표와 리뷰를 연결하는 경험을 우선한다.",
          createdAt: new Date().toISOString()
        }
      ],
      reviews: {
        daily: {
          [today]: {
            top: ["", "", ""],
            text: "",
            checks: [],
            photos: [],
            shareDraft: "",
            shareFormat: "essay"
          }
        },
        weekly: {
          [weekStart]: {
            wins: "",
            lessons: "",
            next: "다음 주에는 기록을 먼저 이어본다."
          }
        }
      }
    };
  }
  function saveState() {
    saveLocalState();
    queueRemoteSave();
  }

  function captureScrollState() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    const selectors = ["[data-week-top-scroll]", ".week-planner-scroll", ".month-scroll", ".workspace", ".main"];
    return {
      x: window.scrollX,
      y: window.scrollY,
      rootTop: scrollingElement.scrollTop,
      rootLeft: scrollingElement.scrollLeft,
      elements: selectors.flatMap((selector) => {
        return Array.from(document.querySelectorAll(selector)).map((element, index) => ({
          selector,
          index,
          top: element.scrollTop,
          left: element.scrollLeft
        }));
      })
    };
  }

  function restoreScrollState(snapshot) {
    if (!snapshot) return;
    const apply = () => {
      const scrollingElement = document.scrollingElement || document.documentElement;
      scrollingElement.scrollTop = snapshot.rootTop;
      scrollingElement.scrollLeft = snapshot.rootLeft;
      window.scrollTo(snapshot.x, snapshot.y);
      snapshot.elements.forEach((item) => {
        const element = document.querySelectorAll(item.selector)[item.index];
        if (!element) return;
        element.scrollTop = item.top;
        element.scrollLeft = item.left;
      });
    };
    window.requestAnimationFrame(() => {
      apply();
      window.requestAnimationFrame(apply);
    });
  }

  function setState(mutator, options = {}) {
    const scrollState = options.preserveScroll === false ? null : captureScrollState();
    mutator(state);
    saveState();
    render();
    restoreScrollState(scrollState);
  }

  function render() {
    if (authStatus !== "signed-in") {
      app.innerHTML = renderAuthScreen();
      bindAuthEvents();
      return;
    }
    const title = navItems.find((item) => item.id === state.activeView)?.label || "오늘";
    app.innerHTML = `
      <div class="app-shell">
        ${renderSidebar()}
        <main class="main">
          ${renderTopbar(title)}
          <div class="workspace">${renderActiveView()}</div>
        </main>
      </div>
      ${renderSchedulePopup()}
      ${renderPlanCopyPicker()}
    `;
    bindEvents();
  }

  function renderAuthScreen() {
    const isLoading = authStatus === "loading";
    return `
      <main class="auth-screen">
        <section class="auth-card">
          <div class="auth-brand">
            <div class="binder-mark" aria-hidden="true"></div>
            <div>
              <p class="brand-title">Life Binder</p>
              <p class="brand-subtitle">Supabase sync</p>
            </div>
          </div>
          <form class="auth-form" data-form="login">
            <h1>로그인</h1>
            <p>등록된 아이디만 사용할 수 있습니다.</p>
            <label>
              <span>아이디</span>
              <input name="loginId" autocomplete="username" required placeholder="아이디">
            </label>
            <label>
              <span>비밀번호</span>
              <input name="password" type="password" autocomplete="current-password" required placeholder="비밀번호">
            </label>
            ${authError ? `<div class="auth-error">${esc(authError)}</div>` : ""}
            ${authMessage ? `<div class="auth-message">${esc(authMessage)}</div>` : ""}
            <button type="submit" class="text-btn primary" ${isLoading ? "disabled" : ""}>${isLoading ? "확인 중..." : "들어가기"}</button>
          </form>
        </section>
      </main>
    `;
  }

  function bindAuthEvents() {
    const form = app.querySelector('[data-form="login"]');
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      authStatus = "loading";
      authError = "";
      authMessage = "로그인 중...";
      render();
      try {
        await signIn(data.loginId, data.password);
        await loadRemoteState();
        authStatus = "signed-in";
        authMessage = "";
        authError = "";
        render();
      } catch (error) {
        console.error("Login failed.", error);
        clearAuthSession();
        authStatus = "signed-out";
        authMessage = "";
        authError = "아이디 또는 비밀번호를 확인해 주세요.";
        render();
      }
    });
  }

  function renderSidebar() {
    return `
      <aside class="sidebar">
        <div class="brand" aria-label="Life Binder Web">
          <div class="binder-mark" aria-hidden="true"></div>
          <div class="brand-copy">
            <p class="brand-title">Life Binder</p>
            <p class="brand-subtitle">목표, 시간, 기록을 연결하는 자기경영 보드</p>
          </div>
        </div>
        <nav class="nav-list" aria-label="주요 화면">
          ${navItems.map((item) => `
            <button class="nav-btn ${state.activeView === item.id ? "is-active" : ""}" data-view="${item.id}" title="${attr(item.tooltip || item.label)}">
              <span class="nav-icon" aria-hidden="true">${esc(item.icon)}</span>
              <span class="nav-label">${esc(item.label)}</span>
            </button>
          `).join("")}
        </nav>
        ${state.activeView === "week" || state.activeView === "today" ? renderWeekModeButtons() : ""}
      </aside>
    `;
  }

  function renderWeekModeButtons() {
    return `
      <div class="sidebar-mode" role="group" aria-label="주간 입력 모드">
        <button type="button" class="${(state.weekDrawMode || "plan") === "plan" ? "is-active" : ""}" data-week-mode="plan">Plan</button>
        <button type="button" class="${state.weekDrawMode === "actual" ? "is-active" : ""}" data-week-mode="actual">Do</button>
      </div>
    `;
  }

  function renderTopbar(title) {
    const subtitle = getSubtitle();
    const weekStart = startOfWeek(state.currentDate);
    const review = ensureWeeklyReview(weekStart);
    const titleDate = state.activeView === "today"
      ? `<span class="topbar-title-date">${esc(dayHeadLabel(state.currentDate))}</span>`
      : "";
    return `
      <header class="topbar">
        <div class="topbar-title-block">
          <h1><span>${esc(title)}</span>${titleDate}</h1>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
        </div>
        ${renderDontForgetField(weekStart, review)}
        <div class="toolbar">
          <button class="icon-btn" data-date-shift="-1" title="이전">‹</button>
          <span class="date-chip">${esc(getDateLabel())}</span>
          <button class="icon-btn" data-date-shift="1" title="다음">›</button>
          <button class="text-btn" data-today title="오늘로 이동">오늘</button>
          <button class="text-btn" data-export title="JSON으로 내보내기">내보내기</button>
          <span class="sync-chip" data-sync-status>${esc(syncStatus || displayLoginId())}</span>
          <button class="text-btn" data-logout title="로그아웃">로그아웃</button>
        </div>
      </header>
    `;
  }

  function renderSchedulePopup() {
    if (!schedulePopup) return "";
    const title = schedulePopup.mode === "actual" ? "실행 기록" : "계획 작성";
    const helper = schedulePopup.mode === "actual"
      ? "실제로 한 일을 적어주세요. 시간은 블록을 드래그해서 조정합니다."
      : "계획 내용을 적어주세요. 시간은 블록을 드래그해서 조정합니다.";
    const value = schedulePopup.title || "";
    const categoryId = normalizeCategoryId(schedulePopup.categoryId);
    const categoryLocked = Boolean(schedulePopup.lockCategory);
    const titleTools = schedulePopup.mode === "actual"
      ? `<button type="button" class="strike-text-btn" data-strike-selection title="선택한 글씨 취소선" aria-label="선택한 글씨 취소선"><s>S</s></button>`
      : "";
    return `
      <div class="popup-backdrop" data-close-schedule-popup></div>
      <form class="schedule-popover" data-form="schedule-popup" style="left:${schedulePopup.x}px; top:${schedulePopup.y}px;">
        <div class="popover-head">
          <div>
            <strong>${esc(title)}</strong>
            <span>${esc(helper)}</span>
          </div>
          <button type="button" data-close-schedule-popup title="닫기">×</button>
        </div>
        <div class="popover-title-field">
          <div class="popover-title-row">
            <label for="schedule-title-input">내용</label>
            ${titleTools}
          </div>
          <textarea id="schedule-title-input" name="title" required autofocus placeholder="무엇을 할까요?">${esc(value)}</textarea>
        </div>
        <div class="popover-time-grid">
          <label>
            <span>시작 시간</span>
            <input type="text" name="start" value="${attr(formatClock(schedulePopup.start))}" inputmode="numeric" pattern="(?:[01][0-9]|2[0-4]):[0-5][0-9]" placeholder="09:00" required>
          </label>
          <label>
            <span>끝 시간</span>
            <input type="text" name="end" value="${attr(formatClock(schedulePopup.end))}" inputmode="numeric" pattern="(?:[01][0-9]|2[0-4]):[0-5][0-9]" placeholder="10:00" required>
          </label>
        </div>
        <div class="popover-categories ${categoryLocked ? "is-locked" : ""}" role="group" aria-label="일정 분류">
          ${categories.map((category) => `
            <label style="--category-color:${attr(category.color)}">
              <input type="checkbox" name="categoryId" value="${attr(category.id)}" ${category.id === categoryId ? "checked" : ""} ${categoryLocked ? "disabled" : ""}>
              <span class="category-swatch" aria-hidden="true"></span>
              <span>${esc(category.name)}</span>
            </label>
          `).join("")}
        </div>
        <div class="popover-actions">
          ${schedulePopup.action === "edit" ? `<button type="button" class="text-btn danger" data-delete-schedule-popup>삭제</button>` : ""}
          <button type="button" class="text-btn" data-close-schedule-popup>취소</button>
          <button type="submit" class="text-btn primary">저장</button>
        </div>
      </form>
    `;
  }

  function monthStartISO(iso) {
    const date = parseISO(iso);
    date.setDate(1);
    return toISO(date);
  }

  function sameMonth(a, b) {
    const left = parseISO(a);
    const right = parseISO(b);
    return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
  }

  function renderPlanCopyPicker() {
    if (!planCopyPicker) return "";
    const sourceDate = planCopyPicker.sourceDate;
    const month = monthStartISO(planCopyPicker.month || sourceDate);
    const gridStart = startOfWeek(month);
    const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    const planCount = state.blocks.filter((block) => block.date === sourceDate && !block.actualOnly && !block.cancelled).length;
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return `
      <div class="popup-backdrop plan-copy-backdrop" data-close-plan-copy></div>
      <section class="plan-copy-popover" role="dialog" aria-modal="true" aria-label="Plan 복사 날짜 선택">
        <div class="plan-copy-head">
          <div>
            <strong>Plan 복사</strong>
            <span>${esc(dayHeadLabel(sourceDate))}의 계획 ${planCount}개를 복사할 날짜를 고릅니다.</span>
          </div>
          <button type="button" data-close-plan-copy title="닫기">×</button>
        </div>
        <div class="plan-copy-monthbar">
          <button type="button" data-plan-copy-month-shift="-1" title="이전 달">‹</button>
          <strong>${esc(monthTitle(month))}</strong>
          <button type="button" data-plan-copy-month-shift="1" title="다음 달">›</button>
        </div>
        <div class="plan-copy-weekdays">
          ${weekdays.map((day) => `<span>${esc(day)}</span>`).join("")}
        </div>
        <div class="plan-copy-calendar">
          ${days.map((day) => {
            const isSource = day === sourceDate;
            const isToday = day === todayISO();
            return `
              <button type="button" class="plan-copy-day ${sameMonth(day, month) ? "" : "is-muted"} ${isToday ? "is-today" : ""} ${isSource ? "is-source" : ""}" data-plan-copy-target="${attr(day)}" title="${attr(dayHeadLabel(day))}">
                <span>${parseISO(day).getDate()}</span>
              </button>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function getSubtitle() {
    if (state.activeView === "today") {
      return "";
    }
    if (state.activeView === "week") {
      return `${formatDate(startOfWeek(state.currentDate))}부터 ${formatDate(endOfWeek(state.currentDate))}까지`;
    }
    if (state.activeView === "month") {
      return `${monthTitle(state.currentDate)} 로드맵`;
    }
    if (state.activeView === "stats") {
      return "계획과 실행 시간의 흐름을 확인합니다.";
    }
    if (state.activeView === "guide") {
      return "주요 기능의 사용 예시를 한곳에서 봅니다.";
    }
    return "오늘의 실행과 다음 리뷰까지 한 번에 봅니다.";
  }

  function getDateLabel() {
    if (state.activeView === "month") return monthTitle(state.currentDate);
    if (state.activeView === "week") return `${formatDate(startOfWeek(state.currentDate))} 주`;
    return formatDate(state.currentDate);
  }

  function renderActiveView() {
    switch (state.activeView) {
      case "week":
        return renderWeekView();
      case "month":
        return renderMonthView();
      case "goals":
        return renderGoalsView();
      case "projects":
        return renderProjectsView();
      case "binder":
        return renderBinderView();
      case "review":
        return renderReviewView();
      case "stats":
        return renderStatsView();
      case "guide":
        return renderGuideView();
      default:
        return renderTodayView();
    }
  }

  function renderTodayView() {
    const date = state.currentDate;
    const log = ensureDailyLog(date);
    const blocks = blocksForDate(date);
    const dailyChecks = log.checks || [];
    const selectedBlock = blocks.find((block) => block.id === state.todayDetailBlockId) || null;

    return `
      <div class="today-layout">
        <section class="panel sheet today-record-panel">
          <div class="panel-body">
            ${renderTodayScheduleBoard(date, selectedBlock?.id || "")}
          </div>
        </section>
        <aside class="today-side">
          ${renderTodayDetailPanel(selectedBlock, date, dailyChecks)}
          ${renderTodayMemoPanel(selectedBlock)}
          ${renderTodayJournalPanel(date, log)}
          ${renderTodaySharePanel(date, log)}
        </aside>
      </div>
    `;
  }

  function renderTodayLinkedRecord(block, selected = false) {
    const hasPlan = !block.actualOnly;
    const hasActual = blockHasActualLine(block);
    const category = categoryById(hasActual ? (block.actualCategoryId || block.categoryId) : block.categoryId);
    const displayTitle = block.actualText || block.title;
    const displayTime = hasActual
      ? formatTimeRange(block.actualStart || block.start, block.actualEnd || block.end)
      : formatTimeRange(block.start, block.end);
    return `
      <button type="button" class="today-schedule-card today-schedule-select ${selected ? "is-selected" : ""} ${blockHasLinkedNote(block) ? "has-note" : ""}" data-select-today-block="${attr(block.id)}" style="border-left-color:${attr(category.color)}">
        <div class="today-card-head">
          <span>${esc(category.name)}</span>
          <strong>${esc(displayTime)}</strong>
        </div>
        <strong class="today-schedule-title">${hasActual ? richMultiline(displayTitle || "일정") : multiline(displayTitle || "일정")}</strong>
        <span class="today-schedule-meta">${hasPlan ? `계획 ${esc(formatTimeRange(block.start, block.end))}` : "계획 없음"}${hasActual ? ` · 실행 ${esc(formatTimeRange(block.actualStart || block.start, block.actualEnd || block.end))}` : ""}</span>
      </button>
    `;
  }

  function renderTodayScheduleBoard(date, selectedBlockId) {
    const blocks = blocksForDate(date);
    const mode = state.weekDrawMode || "plan";
    const segments = layoutCalendarSegments(blocks, mode);
    return `
      <div class="day-column today-day-column">
        <div class="day-head">
          <div class="day-head-main">
            <button class="day-head-select" data-view="week" title="주간 탭에서 보기">
              <span class="day-date-line">${esc(dayHeadLabel(date))}</span>
            </button>
            <button type="button" class="day-mode-chip ${mode === "actual" ? "is-do" : "is-plan"}" data-toggle-week-mode title="Plan/Do 전환">${mode === "actual" ? "Do" : "Plan"}</button>
          </div>
        </div>
        <div class="day-draw-board">
          <div class="day-axis">${renderTimeAxis()}</div>
          <div class="draw-lane calendar-draw-lane today-editable-lane ${mode === "actual" ? "is-actual-mode" : "is-plan-mode"}" data-draw-lane="${attr(mode)}" data-date="${attr(date)}" title="Drag to create ${mode === "actual" ? "Do" : "Plan"}">
            ${segments.map((segment) => renderCalendarSegment(segment, mode, "today", selectedBlockId)).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderTodayDetailPanel(block, date, dailyChecks) {
    const checksMarkup = renderTodayDetailChecks(date, dailyChecks);
    if (!block) {
      return `
        <section class="panel today-detail-panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">일정 상세</h2>
              <p class="panel-subtitle">왼쪽 일정 중 기록을 남길 항목을 선택합니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="today-detail-top">
              <div class="empty">선택한 일정이 없습니다.</div>
              ${checksMarkup}
            </div>
          </div>
        </section>
      `;
    }
    const hasPlan = !block.actualOnly;
    const hasActual = blockHasActualLine(block);
    const category = categoryById(hasActual ? (block.actualCategoryId || block.categoryId) : block.categoryId);
    return `
      <section class="panel today-detail-panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">일정 상세</h2>
            <p class="panel-subtitle">${esc(category.name)}</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="today-detail-top">
            <div class="today-detail-summary" style="border-left-color:${attr(category.color)}">
              <strong>${hasActual ? richMultiline(block.actualText || block.title || "일정") : multiline(block.actualText || block.title || "일정")}</strong>
              <span>${hasPlan ? `계획 ${esc(formatTimeRange(block.start, block.end))}` : "계획 없음"}${hasActual ? ` · 실행 ${esc(formatTimeRange(block.actualStart || block.start, block.actualEnd || block.end))}` : ""}</span>
              <div class="today-detail-actions">
                ${hasPlan ? `<button type="button" class="text-btn" data-edit-plan="${attr(block.id)}">계획 수정</button>` : ""}
                ${hasActual
                  ? `<button type="button" class="text-btn" data-edit-actual="${attr(block.id)}">실행 수정</button>`
                  : hasPlan ? `<button type="button" class="text-btn" data-create-actual-detail="${attr(block.id)}">실행 만들기</button>` : ""}
              </div>
            </div>
            ${checksMarkup}
          </div>
        </div>
      </section>
    `;
  }

  function renderTodayDetailChecks(date, dailyChecks) {
    return `
      <div class="today-detail-checks">
        <div class="today-detail-check-head">
          <h3>오늘 체크박스</h3>
          <span>하루 체크항목</span>
        </div>
        ${renderDailyCheckForm(date)}
        <div class="list today-check-list">
          ${dailyChecks.length ? dailyChecks.map((item, idx) => renderDailyCheckRow(item, idx, date)).join("") : `<div class="empty">오늘 체크박스가 없습니다.</div>`}
        </div>
      </div>
    `;
  }

  function renderTodayMemoPanel(block) {
    if (!block) {
      return `
        <section class="panel today-memo-panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">메모</h2>
              <p class="panel-subtitle">일정을 선택하면 메모를 남길 수 있습니다.</p>
            </div>
          </div>
          <div class="panel-body"><div class="empty">선택한 일정이 없습니다.</div></div>
        </section>
      `;
    }
    return `
      <section class="panel today-memo-panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">메모</h2>
            <p class="panel-subtitle">선택한 일정에 연결됩니다.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="today-note-card ${blockHasLinkedNote(block) ? "has-note" : ""}">
            <label class="note-label" for="memo-${attr(block.id)}">메모</label>
            <textarea id="memo-${attr(block.id)}" class="block-memo" data-block-id="${attr(block.id)}" placeholder="이 일정에만 남길 생각, 결과, 다음 행동">${esc(block.memoText || "")}</textarea>
            <div class="photo-strip">
              ${renderBlockAttachments(block)}
              <label class="photo-add">
                자료 추가
                <input class="block-photo-input" type="file" multiple data-block-id="${attr(block.id)}">
              </label>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderTodayJournalPanel(date, log) {
    const photos = Array.isArray(log.photos) ? log.photos : [];
    return `
      <section class="panel today-journal-panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">오늘 일기</h2>
            <p class="panel-subtitle">일상을 사진과 글로 정리합니다.</p>
          </div>
        </div>
        <div class="panel-body today-journal-box">
          <textarea class="daily-journal" data-journal-date="${attr(date)}" placeholder="오늘의 일, 감정, 기억할 장면, 내일로 이어갈 생각을 적어보세요.">${esc(log.text || "")}</textarea>
          <div class="journal-story-grid">
            ${photos.map((photo, idx) => renderJournalPhoto(photo, idx, date)).join("")}
            <label class="journal-photo-add">
              <span>사진 추가</span>
              <input class="daily-journal-photo-input" type="file" accept="image/*" multiple data-journal-date="${attr(date)}">
            </label>
          </div>
          <span class="save-hint">사진과 글은 오늘 일기에 함께 저장됩니다.</span>
        </div>
      </section>
    `;
  }

  function renderTodaySharePanel(date, log) {
    const format = shareFormatById(log.shareFormat);
    const blocks = blocksForDate(date);
    const memoCount = blocks.filter((block) => (block.memoText || "").trim()).length;
    const photoCount = (log.photos || []).length + blocks.reduce((sum, block) => sum + (block.photos || []).length, 0);
    return `
      <section class="panel today-share-panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">오늘 공유글 만들기</h2>
            <p class="panel-subtitle">오늘 기록을 다른 사람에게 보여줄 수 있는 초안으로 정리합니다.</p>
          </div>
        </div>
        <div class="panel-body today-share-box">
          <div class="share-explain">
            <strong>기능 설명</strong>
            <p>오늘 일정, 체크박스, 메모, 일기, 사진 기록을 참고해 플랫폼별 공유글 초안을 만듭니다. 자동으로 게시하지 않으니 민감한 내용은 직접 확인하고 다듬은 뒤 복사해서 사용하세요.</p>
          </div>
          <div class="share-format-bar" aria-label="공유글 형식">
            ${shareFormats.map((item) => `
              <button type="button" class="share-format-btn ${item.id === format.id ? "is-active" : ""}" data-share-date="${attr(date)}" data-share-format="${attr(item.id)}">
                <strong>${esc(item.label)}</strong>
                <span>${esc(item.tone)}</span>
              </button>
            `).join("")}
          </div>
          <div class="share-source-strip" aria-label="초안에 참고되는 기록">
            <span>일정 ${blocks.length}</span>
            <span>체크 ${Array.isArray(log.checks) ? log.checks.length : 0}</span>
            <span>메모 ${memoCount}</span>
            <span>사진 ${photoCount}</span>
          </div>
          <div class="share-actions">
            <button type="button" class="share-primary" data-generate-share-draft="${attr(date)}">오늘 공유글 만들기</button>
            <button type="button" class="share-secondary" data-copy-share-draft="${attr(date)}">복사</button>
          </div>
          <textarea class="daily-share-draft" data-share-date="${attr(date)}" placeholder="버튼을 누르면 ${attr(format.label)} 형식의 공유글 초안이 여기에 만들어집니다. 만든 뒤 자유롭게 고쳐 쓸 수 있습니다.">${esc(log.shareDraft || "")}</textarea>
          <span class="save-hint">초안은 오늘 기록에 저장됩니다. 형식을 바꾼 뒤 다시 만들기를 누르면 현재 기록 기준으로 새 초안이 만들어집니다.</span>
        </div>
      </section>
    `;
  }

  function buildTodayShareDraft(date, log, formatId) {
    const format = shareFormatById(formatId);
    const dayLabel = formatDate(date, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
    const blocks = blocksForDate(date);
    const actualBlocks = blocks.filter(blockHasActualLine);
    const displayBlocks = actualBlocks.length ? actualBlocks : blocks;
    const scheduleLines = displayBlocks.slice(0, 7).map((block) => shareScheduleLine(block));
    const checkLines = (log.checks || [])
      .filter((item) => (item.title || "").trim())
      .slice(0, 6)
      .map((item) => `- ${statusById(normalizeCheckStatus(item)).label}: ${plainLine(item.title)}`);
    const memoLines = blocks
      .filter((block) => (block.memoText || "").trim())
      .slice(0, 4)
      .map((block) => `- ${plainLine(block.actualText || block.title || "일정")}: ${plainLine(block.memoText)}`);
    const journal = (log.text || "").trim();
    const photoCount = (log.photos || []).length + blocks.reduce((sum, block) => sum + (block.photos || []).length, 0);
    const photoLine = photoCount ? `사진 ${photoCount}장은 글에 어울리는 장면으로 골라 함께 붙여보세요.` : "";
    const schedules = scheduleLines.length ? scheduleLines.join("\n") : "- 아직 공유할 일정 기록이 없습니다.";
    const checks = checkLines.length ? checkLines.join("\n") : "- 아직 체크 기록이 없습니다.";
    const memos = memoLines.length ? memoLines.join("\n") : "- 아직 일정 메모가 없습니다.";
    const journalText = journal || "오늘을 지나며 기억하고 싶은 장면을 여기에 덧붙여보세요.";

    if (format.id === "social") {
      return [
        `${dayLabel}`,
        "",
        journalText,
        "",
        "오늘의 흐름",
        schedules,
        "",
        "기억할 것",
        memoLines.length ? memos : checks,
        photoLine,
        "",
        "#오늘기록 #일상기록 #라이프바인더 #시간관리"
      ].filter(Boolean).join("\n");
    }

    if (format.id === "professional") {
      return [
        `오늘의 기록에서 남은 배움`,
        "",
        `${dayLabel}의 계획과 실행을 돌아보며, 오늘 남은 핵심은 다음과 같습니다.`,
        "",
        "1. 오늘 실행한 일",
        schedules,
        "",
        "2. 확인한 것",
        checks,
        "",
        "3. 다음에 이어갈 생각",
        memos,
        "",
        journal ? `개인 메모: ${plainLine(journal)}` : "개인 메모: 오늘의 경험에서 배운 점을 한 문장으로 정리해보세요."
      ].join("\n");
    }

    if (format.id === "newsletter") {
      return [
        `안녕하세요. ${dayLabel} 기록을 나눕니다.`,
        "",
        journalText,
        "",
        "오늘의 일정",
        schedules,
        "",
        "오늘의 체크",
        checks,
        "",
        "조금 더 남겨두고 싶은 메모",
        memos,
        "",
        photoLine || "함께 보여주고 싶은 장면이 있다면 사진을 덧붙여도 좋겠습니다.",
        "",
        "읽어주셔서 고맙습니다."
      ].join("\n");
    }

    return [
      `${dayLabel}의 기록`,
      "",
      "오늘의 장면",
      journalText,
      "",
      "오늘의 흐름",
      schedules,
      "",
      "남겨둘 메모",
      memos,
      "",
      "체크한 것",
      checks,
      "",
      photoLine,
      "",
      "마무리",
      "오늘의 기록에서 다른 사람과 나눌 만한 부분만 남기고, 사적인 내용은 덜어낸 뒤 발행해보세요."
    ].filter(Boolean).join("\n");
  }

  function shareScheduleLine(block) {
    const hasActual = blockHasActualLine(block);
    const category = categoryById(hasActual ? (block.actualCategoryId || block.categoryId) : block.categoryId);
    const start = hasActual ? (block.actualStart || block.start) : block.start;
    const end = hasActual ? (block.actualEnd || block.end) : block.end;
    const label = hasActual ? "실행" : "계획";
    const title = plainLine(block.actualText || block.title || "일정");
    return `- ${formatTimeRange(start, end)} ${category.name} ${label}: ${title}`;
  }

  function plainLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function renderJournalPhoto(photo, idx, date) {
    const source = typeof photo === "string" ? photo : photo.data;
    const name = typeof photo === "string" ? `일기 사진 ${idx + 1}` : (photo.name || `일기 사진 ${idx + 1}`);
    const caption = typeof photo === "string" ? "" : (photo.caption || "");
    return `
      <figure class="journal-photo-card">
        <img src="${attr(source)}" alt="${attr(name)}">
        ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}
        <button type="button" data-delete-journal-photo="${attr(date)}" data-photo-index="${idx}" title="사진 삭제">×</button>
      </figure>
    `;
  }

  function renderBlockAttachments(block) {
    return (block.photos || []).map((photo, idx) => {
      const source = typeof photo === "string" ? photo : photo.data;
      const name = typeof photo === "string" ? `첨부 ${idx + 1}` : (photo.name || `첨부 ${idx + 1}`);
      const type = typeof photo === "string" ? "image/*" : (photo.type || "");
      const isImage = type.startsWith("image/") || String(source || "").startsWith("data:image");
      return `
        <figure class="${isImage ? "" : "file-attachment"}">
          ${isImage ? `<img src="${attr(source)}" alt="${attr(name)}">` : `<a href="${attr(source)}" download="${attr(name)}">${esc(shortText(name, 18))}</a>`}
          <button type="button" data-delete-block-photo="${attr(block.id)}" data-photo-index="${idx}" title="첨부 삭제">×</button>
        </figure>
      `;
    }).join("");
  }
  function blockHasLinkedNote(block) {
    return Boolean((block.memoText || "").trim() || (block.photos || []).length);
  }

  function blockHasActualLine(block) {
    return Boolean(
      block.actualOnly ||
      block.actualDone ||
      (block.actualText || "").trim() ||
      block.actualStart ||
      block.actualEnd
    );
  }

  function blockIsExecuted(block) {
    return blockHasActualLine(block);
  }

  function renderDailyCheckForm(date) {
    const formId = `daily-check-title-${date}`;
    return `
      <form class="quick-line daily-check-form" data-form="daily-check" data-check-date="${attr(date)}">
        <div class="field">
          <label for="${attr(formId)}">하루 체크</label>
          <input id="${attr(formId)}" name="title" required placeholder="하루 체크박스">
        </div>
        <button class="icon-btn primary daily-check-add" type="submit" title="오늘 체크박스 추가">+</button>
      </form>
    `;
  }

  function renderDailyCheckRow(item, idx, date) {
    const status = normalizeCheckStatus(item);
    return `
      <div class="list-row check-row ${status === "done" ? "is-done" : ""} ${checkStatusClass(item)}">
        ${renderStatusSelect("daily-check-status", `data-check-date="${attr(date)}" data-check-index="${idx}"`, status)}
        <div>
          <input class="daily-check-title" data-check-date="${attr(date)}" data-check-index="${idx}" value="${attr(item.title)}" title="하루 체크박스 수정">
        </div>
        <button class="icon-btn" data-delete-daily-check="${attr(date)}" data-check-index="${idx}" title="오늘 체크박스 삭제">×</button>
      </div>
    `;
  }

  function renderTaskForm(defaultDate, projectId, scope) {
    const formId = `${projectId || scope || "today"}-${defaultDate}`;
    return `
      <form class="quick-line" data-form="task">
        <div class="field">
          <label for="task-title-${attr(formId)}">할 일</label>
          <input id="task-title-${attr(formId)}" name="title" required placeholder="체크박스 항목">
          <input type="hidden" name="projectId" value="${attr(projectId || "")}">
          <input type="hidden" name="dueDate" value="${attr(defaultDate)}">
          <input type="hidden" name="scope" value="${attr(scope || "work")}">
        </div>
        <button class="text-btn primary" type="submit">추가</button>
      </form>
    `;
  }

  function renderWeekTaskForm(weekStart, scope) {
    const formId = `week-${scope}-${weekStart}`;
    return `
      <form class="quick-line week-task-form" data-form="task">
        <div class="field">
          <label for="task-title-${attr(formId)}">이번 주 체크</label>
          <input id="task-title-${attr(formId)}" name="title" required placeholder="체크 항목">
          <input type="hidden" name="projectId" value="">
          <input type="hidden" name="dueDate" value="${attr(weekStart)}">
          <input type="hidden" name="weekStart" value="${attr(weekStart)}">
          <input type="hidden" name="scope" value="${attr(scope)}">
        </div>
        <button class="icon-btn primary week-task-add" type="submit" title="체크 항목 추가">+</button>
      </form>
    `;
  }

  function renderWeekTaskBucket(title, scope, tasks, weekStart) {
    return `
      <section class="week-task-bucket">
        <div class="week-task-title-row">
          <h4>${esc(title)}</h4>
          ${scope === "work" ? renderCheckStatusLegend() : ""}
        </div>
        ${renderWeekTaskForm(weekStart, scope)}
        <div class="week-check-list">
          ${tasks.length ? tasks.map((task) => renderTaskRow(task, { hidePeriod: true, hideMeta: true })).join("") : `<div class="empty small-empty">${esc(title)} 체크박스가 없습니다.</div>`}
        </div>
      </section>
    `;
  }

  function renderTaskRow(task, options = {}) {
    const goal = goalById(task.goalId);
    const project = projectById(task.projectId);
    const status = normalizeCheckStatus(task);
    const metaParts = [];
    if (!options.hidePeriod) {
      metaParts.push(task.weekStart ? `${task.weekStart} 주간` : (task.dueDate || "마감 없음"));
    }
    if (!options.hideMeta && project) metaParts.push(project.title);
    if (!options.hideMeta && goal) metaParts.push(goal.title);
    const meta = metaParts.join(" · ");
    return `
      <div class="list-row check-row ${status === "done" ? "is-done" : ""} ${checkStatusClass(task)}">
        ${renderStatusSelect("task-status", `data-task-id="${attr(task.id)}"`, status)}
        <div>
          <input class="task-title-input" data-task-id="${attr(task.id)}" value="${attr(task.title)}" title="체크박스 수정">
          ${meta ? `<p class="row-meta">${esc(meta)}</p>` : ""}
        </div>
        <button class="icon-btn" data-delete-task="${attr(task.id)}" title="체크박스 삭제">×</button>
      </div>
    `;
  }

  function renderWeekView() {
    const start = startOfWeek(state.currentDate);
    const days = Array.from({ length: 7 }, (_, idx) => addDays(start, idx));
    const weekBlocks = state.blocks.filter((block) => block.date >= start && block.date <= endOfWeek(state.currentDate));
    const weekTasks = state.tasks
      .filter((task) => (task.scope || "work") !== "monthProject")
      .filter((task) => (task.weekStart || startOfWeek(task.dueDate || start)) === start)
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    const workTasks = weekTasks.filter((task) => (task.scope || "work") === "work");
    const personalTasks = weekTasks.filter((task) => (task.scope || "work") === "personal");
    const stats = categoryPlanActualStats(weekBlocks);
    const review = ensureWeeklyReview(start);
    return `
      <div class="full-grid">
        <section class="panel sheet week-sheet">
          <div class="panel-body">
            <div class="week-task-columns">
              ${renderWeekTaskBucket("업무", "work", workTasks, start)}
              ${renderWeekTaskBucket("개인", "personal", personalTasks, start)}
            </div>
            <div class="week-top-scroll" data-week-top-scroll aria-label="주간표 가로 이동">
              <div class="week-top-scroll-inner"></div>
            </div>
            <div class="week-planner-scroll">
              <div class="week-planner">
                ${days.map((day) => renderDayColumn(day)).join("")}
              </div>
            </div>
          </div>
        </section>
        <div class="view-grid">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">이번 주 시간 배분</h2>
                <p class="panel-subtitle">카테고리별 계획과 수행 시간을 함께 봅니다.</p>
              </div>
            </div>
            <div class="panel-body">
              ${renderPlanActualStats(stats)}
            </div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">주간 리뷰</h2>
                <p class="panel-subtitle">좋았던 것, 배운 것, 다음 초점을 정리합니다.</p>
              </div>
            </div>
            <div class="panel-body">
              ${renderWeeklyReviewForm(start, review)}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderDayColumn(day) {
    const blocks = blocksForDate(day);
    const dailyChecks = ensureDailyLog(day).checks || [];
    const isCurrent = day === todayISO();
    const mode = state.weekDrawMode || "plan";
    const segments = layoutCalendarSegments(blocks, mode);
    return `
      <div class="day-column ${isCurrent ? "is-current" : ""}">
        <div class="day-head">
          <div class="day-head-main">
            <button class="day-head-select" data-select-date="${attr(day)}" title="이 날짜 열기">
              <span class="day-date-line">${esc(dayHeadLabel(day))}</span>
            </button>
            <button type="button" class="day-mode-chip ${mode === "actual" ? "is-do" : "is-plan"}" data-toggle-week-mode title="Plan/Do 전환">${mode === "actual" ? "Do" : "Plan"}</button>
          </div>
          <button type="button" class="day-copy-plan" data-copy-day-plan="${attr(day)}" title="이 날의 Plan을 다른 날짜로 복사">Plan 복사</button>
        </div>
        <div class="day-checks">
          ${renderDailyCheckForm(day)}
          <div class="day-check-list ${dailyChecks.length > 3 ? "has-overflow" : ""}">
            ${dailyChecks.length ? dailyChecks.map((item, idx) => renderDailyCheckRow(item, idx, day)).join("") : `<span class="day-empty">아직 체크박스가 없습니다.</span>`}
          </div>
        </div>
        <div class="day-draw-board">
          <div class="day-axis">${renderTimeAxis()}</div>
          <div class="draw-lane calendar-draw-lane ${mode === "actual" ? "is-actual-mode" : "is-plan-mode"}" data-draw-lane="${attr(mode)}" data-date="${attr(day)}" title="드래그해서 ${mode === "actual" ? "실행 기록" : "계획"} 만들기">
            ${segments.map((segment) => renderCalendarSegment(segment, mode)).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderTimeAxis() {
    const rows = [];
    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += 1) {
      rows.push(`<span>${String(hour).padStart(2, "0")}:00</span>`);
    }
    return rows.join("");
  }

  function dayHeadLabel(date) {
    return `${formatDate(date, { month: "numeric", day: "numeric" })} (${formatDate(date, { weekday: "short" })})`;
  }

  function renderPlanSegment(block) {
    const category = categoryById(block.categoryId);
    const top = linePercent(block.start);
    const height = durationPercent(block.start, block.end, 0);
    return `
      <div class="time-segment plan-segment ${block.cancelled ? "is-cancelled" : ""}" data-edit-plan="${attr(block.id)}" style="top:${top}%; height:${height}%; --segment-color:${attr(category.color)}; border-left-color:${attr(category.color)}">
        <div class="segment-head">
          <strong class="segment-title">${multiline(block.title)}</strong>
          <span class="segment-time">${esc(formatTimeRange(block.start, block.end))}</span>
        </div>
        ${block.cancelled ? `<button class="cancel-memo" data-open-cancel="${attr(block.id)}" title="취소 메모 보기">취소: ${esc(shortText(block.cancelMemo || "메모 없음", 18))}</button>` : ""}
      </div>
    `;
  }

  function actualMatchesPlan(block) {
    if (!blockHasActualLine(block) || block.actualOnly) return false;
    return String(block.actualText || block.title || "").trim() === String(block.title || "").trim();
  }

  function blockHasLinkedActual(block) {
    return !block.actualOnly && blockHasActualLine(block);
  }

  function segmentDurationClass(start, end) {
    const minutes = Math.max(0, minutesFromTime(end) - minutesFromTime(start));
    if (minutes <= 30) return "is-tiny";
    if (minutes <= 45) return "is-short";
    if (minutes <= 60) return "is-compact";
    return "";
  }

  function renderCalendarSegment(segment, mode = state.weekDrawMode || "plan", context = "week", selectedBlockId = "") {
    const block = segment.block;
    const isActual = segment.kind === "actual";
    const isToday = context === "today";
    const segmentMode = isActual ? "actual" : "plan";
    const isReadonly = segmentMode !== mode;
    const isLinkedPair = blockHasLinkedActual(block);
    const isPlanSource = !isActual && mode === "actual" && !isLinkedPair;
    const showPlanSummary = !isActual && mode === "actual" && isLinkedPair;
    const showActualSummary = isActual && mode === "plan";
    const summaryClass = showPlanSummary || showActualSummary ? "time-summary-segment" : "";
    const actualAction = !isToday && isActual && !isReadonly ? `data-edit-actual="${attr(block.id)}"` : "";
    const planAction = !isToday && mode === "plan"
      ? `data-edit-plan="${attr(block.id)}"`
      : !isToday && mode === "actual" && isPlanSource
        ? `data-copy-actual="${attr(block.id)}"`
        : "";
    const todayAction = isToday ? `data-select-today-block="${attr(block.id)}"` : "";
    const selectedClass = isToday && block.id === selectedBlockId ? "is-selected" : "";
    const category = isActual
      ? categoryById(block.actualCategoryId || block.categoryId)
      : categoryById(block.categoryId);
    const top = linePercent(segment.start);
    const height = durationPercent(segment.start, segment.end, 0);
    const left = segment.left;
    const width = segment.width;
    const sizeClass = segmentDurationClass(segment.start, segment.end);
    const style = `top:${top}%; height:${height}%; left:calc(${left}% + 6px); width:calc(${width}% - 12px); --segment-color:${attr(category.color)}; border-left-color:${attr(category.color)}`;
    if (isActual) {
      return `
        <div class="time-segment actual-segment calendar-segment ${isReadonly ? "is-readonly" : ""} ${isLinkedPair ? "is-linked-pair is-primary-actual" : ""} ${showActualSummary ? "actual-summary-segment" : ""} ${summaryClass} ${sizeClass} ${isToday ? "today-calendar-segment" : ""} ${selectedClass}" ${actualAction} ${todayAction} data-segment-id="${attr(block.id)}" data-segment-kind="actual" style="${style}">
          <span class="segment-resize-handle top" data-resize-edge="start" title="시작 시간 조정"></span>
          <div class="segment-head ${showActualSummary ? "plan-time-stack" : ""}">
            ${showActualSummary
              ? `<strong>${esc(formatClock(segment.start))}</strong><span>${esc(formatClock(segment.end))}</span>`
              : `<strong class="segment-title">${richMultiline(block.actualText || block.title || "실행 내용")}</strong><span class="segment-time">${esc(formatTimeRange(segment.start, segment.end))}</span>`}
          </div>
          <span class="segment-resize-handle bottom" data-resize-edge="end" title="종료 시간 조정"></span>
        </div>
      `;
    }
    return `
      <div class="time-segment plan-segment calendar-segment ${block.cancelled ? "is-cancelled" : ""} ${isReadonly ? "is-readonly" : ""} ${isPlanSource ? "is-do-source" : ""} ${isLinkedPair ? "is-linked-pair" : ""} ${showPlanSummary ? "plan-summary-segment" : ""} ${summaryClass} ${sizeClass} ${isToday ? "today-calendar-segment" : ""} ${selectedClass}" ${planAction} ${todayAction} data-segment-id="${attr(block.id)}" data-segment-kind="plan" style="${style}">
        <span class="segment-resize-handle top" data-resize-edge="start" title="시작 시간 조정"></span>
        <div class="segment-head ${showPlanSummary ? "plan-time-stack" : ""}">
          ${showPlanSummary
            ? `<strong>${esc(formatClock(block.start))}</strong><span>${esc(formatClock(block.end))}</span>`
            : `<strong class="segment-title">${multiline(block.title)}</strong><span class="segment-time">계획 ${esc(formatTimeRange(block.start, block.end))}</span>`}
        </div>
        ${block.cancelled ? `<button class="cancel-memo" data-open-cancel="${attr(block.id)}" title="취소 메모 보기">취소: ${esc(shortText(block.cancelMemo || "메모 없음", 18))}</button>` : ""}
        <span class="segment-resize-handle bottom" data-resize-edge="end" title="종료 시간 조정"></span>
      </div>
    `;
  }

  function layoutCalendarSegments(blocks, mode = state.weekDrawMode || "plan") {
    const raw = [];
    blocks.forEach((block) => {
      if (!block.actualOnly) {
        raw.push({
          block,
          kind: "plan",
          start: block.start,
          end: block.end,
          startMinutes: minutesFromTime(block.start),
          endMinutes: minutesFromTime(block.end)
        });
      }
      if (blockHasActualLine(block)) {
        const actualStart = block.actualStart || block.start;
        const actualEnd = block.actualEnd || block.end;
        raw.push({
          block,
          kind: "actual",
          start: actualStart,
          end: actualEnd,
          startMinutes: minutesFromTime(actualStart),
          endMinutes: minutesFromTime(actualEnd)
        });
      }
    });

    const sorted = raw
      .filter((item) => item.endMinutes > item.startMinutes)
      .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);

    const groups = [];
    sorted.forEach((item) => {
      const group = groups.find((candidate) => item.startMinutes < candidate.endMinutes);
      if (group) {
        group.items.push(item);
        group.endMinutes = Math.max(group.endMinutes, item.endMinutes);
      } else {
        groups.push({ items: [item], endMinutes: item.endMinutes });
      }
    });

    groups.forEach((group) => {
      const planItems = group.items.filter((item) => item.kind === "plan");
      const actualItems = group.items.filter((item) => item.kind === "actual");
      if (mode === "actual") {
        const planSummaries = planItems.filter((item) => blockHasLinkedActual(item.block));
        const sourcePlans = planItems
          .filter((item) => !blockHasLinkedActual(item.block))
          .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
        const primaryActuals = actualItems
          .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
        if (planSummaries.length) {
          assignSegmentColumns(planSummaries, 0, 18);
        }
        if (sourcePlans.length) {
          assignSegmentColumns(sourcePlans, 0, 100);
        }
        if (primaryActuals.length) {
          assignSegmentColumns(primaryActuals, planSummaries.length ? 14 : 0, planSummaries.length ? 86 : 100);
        }
      } else if (mode === "plan") {
        const primaryItems = planItems;
        const actualSummaries = actualItems;
        if (primaryItems.length) {
          assignSegmentColumns(primaryItems, 0, 100);
        }
        const unmatchedActualSummaries = [];
        actualSummaries.forEach((item) => {
          const matchingPlan = primaryItems.find((plan) => plan.block.id === item.block.id);
          if (matchingPlan) {
            item.columnIndex = matchingPlan.columnIndex || 0;
            item.left = matchingPlan.left;
            item.width = matchingPlan.width;
          } else {
            unmatchedActualSummaries.push(item);
          }
        });
        if (unmatchedActualSummaries.length) {
          assignSegmentColumns(unmatchedActualSummaries, 0, 100);
        }
      } else {
        assignSegmentColumns(group.items, 0, 100);
      }
    });

    return sorted;
  }

  function assignSegmentColumns(items, leftOffset, totalWidth) {
    const columns = [];
    items.forEach((item) => {
      let columnIndex = columns.findIndex((end) => item.startMinutes >= end);
      if (columnIndex === -1) {
        columnIndex = columns.length;
        columns.push(item.endMinutes);
      } else {
        columns[columnIndex] = item.endMinutes;
      }
      item.columnIndex = columnIndex;
    });
    const columnCount = Math.max(columns.length, 1);
    items.forEach((item) => {
      item.width = totalWidth / columnCount;
      item.left = leftOffset + item.columnIndex * item.width;
    });
  }

  function renderActualSegment(block) {
    const top = linePercent(block.actualStart || block.start);
    const height = durationPercent(block.actualStart || block.start, block.actualEnd || block.end, 0);
    return `
      <div class="time-segment actual-segment" data-edit-actual="${attr(block.id)}" style="top:${top}%; height:${height}%">
        <div class="segment-head">
          <strong class="segment-title">${richMultiline(block.actualText || "실행 내용")}</strong>
          <span class="segment-time">${esc(formatTimeRange(block.actualStart || block.start, block.actualEnd || block.end))}</span>
        </div>
      </div>
    `;
  }

  function shortText(text, max) {
    const clean = String(text || "").trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max)}...`;
  }

  function renderDontForgetField(weekStart, review) {
    const id = `dont-forget-${weekStart}`;
    return `
      <div class="dont-forget-wrap">
        <label class="dont-forget-field" for="${attr(id)}">
          <span>Don't Forget</span>
          <input id="${attr(id)}" class="dont-forget-input" data-week-start="${attr(weekStart)}" value="${attr(review.dontForget || "")}" placeholder="Remember...">
        </label>
      </div>
    `;
  }

  function renderCheckStatusLegend() {
    return `
      <div class="status-legend week-status-legend" aria-label="체크 상태 설명">
        ${checkStatuses.filter((status) => status.id !== "open").map((status) => `<span><i class="status-toggle is-${attr(status.id)}"><b class="status-icon" aria-hidden="true">${statusIconMarkup(status.id)}</b></i>${esc(status.label)}</span>`).join("")}
      </div>
    `;
  }

  function renderWeeklyReviewForm(weekStart, review) {
    return `
      <form class="form-grid" data-form="weekly-review" data-week-start="${attr(weekStart)}">
        <div class="field">
          <label for="wins">이번 주 성과</label>
          <textarea id="wins" name="wins" placeholder="완료한 일과 의미 있었던 결과">${esc(review.wins || "")}</textarea>
        </div>
        <div class="field">
          <label for="lessons">배운 점</label>
          <textarea id="lessons" name="lessons" placeholder="계획과 실제가 달랐던 이유">${esc(review.lessons || "")}</textarea>
        </div>
        <div class="field">
          <label for="next">다음 주 초점</label>
          <textarea id="next" name="next" placeholder="줄일 일과 남길 일">${esc(review.next || "")}</textarea>
        </div>
        <button class="text-btn primary" type="submit">리뷰 저장</button>
      </form>
    `;
  }

  function renderMonthView() {
    const date = parseISO(state.currentDate);
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = new Date(first);
    const firstDay = first.getDay();
    gridStart.setDate(first.getDate() - firstDay);
    const days = Array.from({ length: 42 }, (_, idx) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + idx);
      return toISO(d);
    });
    return `
      <div class="month-page">
        <section class="panel sheet month-main-panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">월간</h2>
              <p class="panel-subtitle">주별 흐름과 날짜별 체크 항목을 한 화면에서 훑어봅니다.</p>
            </div>
          </div>
          <div class="panel-body month-scroll">
            <div class="month-board">
              ${renderMonthWeekSummaries(days, month)}
              <div class="month-calendar-wrap">
                <div class="month-grid">
                  ${["일", "월", "화", "수", "목", "금", "토"].map((name, idx) => `<div class="month-head ${idx === 0 ? "is-sunday" : ""}">${name}</div>`).join("")}
                  ${days.map((day) => renderMonthCell(day, month)).join("")}
                </div>
              </div>
            </div>
          </div>
        </section>
        ${renderMonthCheckEditor()}
      </div>
    `;
  }

  function renderMonthCell(day, currentMonth) {
    const date = parseISO(day);
    const isMuted = date.getMonth() !== currentMonth;
    const isSelected = day === state.currentDate;
    const checks = ensureDailyLog(day).checks || [];
    return `
      <button class="month-cell ${isMuted ? "is-muted" : ""} ${isSelected ? "is-selected" : ""} ${checks.length > 4 ? "has-many-checks" : ""}" data-select-date="${attr(day)}">
        <div class="month-number">
          <span class="month-date-pill">${date.getDate()}</span>
          <span class="month-check-count">${checks.length ? `${checks.filter(checkIsDone).length}/${checks.length}` : ""}</span>
        </div>
        <div class="month-checks">
          ${checks.map(renderMonthCheckChip).join("")}
        </div>
      </button>
    `;
  }

  function renderMonthCheckEditor() {
    if (!monthEditorDate) return "";
    const checks = ensureDailyLog(monthEditorDate).checks || [];
    return `
      <div class="month-editor-backdrop" data-close-month-editor></div>
      <section class="panel month-day-editor" role="dialog" aria-label="월간 날짜 체크항목 편집">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">${esc(dayHeadLabel(monthEditorDate))}</h2>
            <p class="panel-subtitle">체크항목을 추가, 수정, 삭제합니다.</p>
          </div>
          <button type="button" class="icon-btn" data-close-month-editor title="닫기">×</button>
        </div>
        <div class="panel-body">
          ${renderDailyCheckForm(monthEditorDate)}
          <div class="list month-editor-check-list">
            ${checks.length ? checks.map((item, idx) => renderDailyCheckRow(item, idx, monthEditorDate)).join("") : `<div class="empty">체크항목이 없습니다.</div>`}
          </div>
        </div>
      </section>
    `;
  }

  function renderMonthCheckChip(item) {
    const status = statusById(normalizeCheckStatus(item));
    return `<span class="month-check-chip ${status.id === "done" ? "is-done" : ""} ${checkStatusClass(item)}"><i class="month-check-icon status-toggle is-${attr(status.id)}" aria-hidden="true"><b class="status-icon">${statusIconMarkup(status.id)}</b></i><b>${esc(shortText(item.title || "", 18))}</b></span>`;
  }

  function renderMonthWeekSummaries(days, currentMonth) {
    const weekStarts = days.filter((_, idx) => idx % 7 === 0);
    return `
      <div class="month-week-summaries">
        <div class="month-summary-head">주간 요약</div>
        ${weekStarts.map((weekStart) => renderMonthWeekSummary(weekStart, currentMonth)).join("")}
      </div>
    `;
  }

  function renderMonthWeekSummary(weekStart, currentMonth) {
    const weekDays = Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx));
    const weekEnd = weekDays[6];
    const weekBlocks = state.blocks.filter((block) => block.date >= weekStart && block.date <= weekEnd);
    const categoryMinutes = categoryPlanActualStats(weekBlocks);
    const title = `${formatDate(weekStart, { month: "numeric", day: "numeric" })} - ${formatDate(weekEnd, { month: "numeric", day: "numeric" })}`;
    return `
      <button type="button" class="month-week-summary" data-select-date="${attr(weekStart)}" title="${attr(`${title} 주간 요약`)}">
        ${renderMonthPlanActualStats(categoryMinutes)}
      </button>
    `;
  }

  function renderMonthPlanActualStats(stats) {
    const visible = stats.slice(0, 5);
    const max = Math.max(...visible.flatMap((item) => [item.planned, item.actual]), 1);
    const valueText = (minutes) => minutes > 0 ? minutesToShortText(minutes) : "0";
    const widthPercent = (minutes) => minutes > 0 ? Math.max(4, Math.round((minutes / max) * 100)) : 0;
    return `
      <div class="month-summary-stat-list">
        ${visible.map((item) => `
          <div class="month-summary-stat" style="--stat-color:${attr(item.color)}" title="${attr(`${item.name} 계획 ${minutesToShortText(item.planned)} 수행 ${minutesToShortText(item.actual)}`)}">
            <svg class="month-summary-color" aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" style="color:${attr(item.color)}"><circle cx="5" cy="5" r="5" fill="currentColor"></circle></svg>
            <div class="month-summary-bars">
              <span class="month-summary-line is-plan">
                <svg class="month-summary-line-graph" aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none">
                  <line x1="0" y1="0.5" x2="100" y2="0.5"></line>
                  <line class="is-value" x1="0" y1="0.5" x2="${widthPercent(item.planned)}" y2="0.5"></line>
                </svg>
                <b>${esc(valueText(item.planned))}</b>
              </span>
              <span class="month-summary-line is-actual">
                <svg class="month-summary-line-graph" aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none">
                  <line x1="0" y1="0.5" x2="100" y2="0.5"></line>
                  <line class="is-value" x1="0" y1="0.5" x2="${widthPercent(item.actual)}" y2="0.5"></line>
                </svg>
                <b>${esc(valueText(item.actual))}</b>
              </span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function minutesToShortText(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return `${h}h${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  function renderMonthProjectForm(year, month) {
    const firstDay = toISO(new Date(year, month, 1));
    return `
      <form class="quick-line week-task-form" data-form="task">
        <div class="field">
          <label for="month-project-title">이번 달 프로젝트</label>
          <input id="month-project-title" name="title" required placeholder="이번 달 프로젝트 체크박스">
          <input type="hidden" name="projectId" value="">
          <input type="hidden" name="dueDate" value="${attr(firstDay)}">
          <input type="hidden" name="weekStart" value="${attr(startOfWeek(firstDay))}">
          <input type="hidden" name="scope" value="monthProject">
        </div>
        <button class="icon-btn primary week-task-add" type="submit" title="이번 달 프로젝트 추가">+</button>
      </form>
    `;
  }
  function renderMonthlyProjects(year, month) {
    const items = state.tasks.filter((task) => {
      if ((task.scope || "") !== "monthProject" || !task.dueDate) return false;
      const due = parseISO(task.dueDate);
      return due.getFullYear() === year && due.getMonth() === month;
    });
    if (!items.length) return `<div class="empty">이번 달 프로젝트 체크박스가 없습니다.</div>`;
    return items.map(renderTaskRow).join("");
  }

  function renderGoalsView() {
    return `
      <div class="view-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">목표 목록</h2>
              <p class="panel-subtitle">연간 방향을 월간, 주간, 일간 행동으로 내려봅니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="list">
              ${state.goals.length ? state.goals.map(renderGoalRow).join("") : `<div class="empty">아직 목표가 없습니다.</div>`}
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">목표 추가</h2>
              <p class="panel-subtitle">구체적인 기간과 영역을 함께 적습니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <form class="form-grid" data-form="goal">
              <div class="field">
                <label for="goal-title">목표명</label>
                <input id="goal-title" name="title" required placeholder="예: 90일 동안 시간 기록 습관 만들기">
              </div>
              <div class="form-row">
                <div class="field">
                  <label for="goal-category">영역</label>
                  <input id="goal-category" name="category" placeholder="성장, 건강, 업무">
                </div>
                <div class="field">
                  <label for="goal-end">마감</label>
                  <input id="goal-end" name="endDate" type="date" value="${attr(addDays(state.currentDate, 90))}">
                </div>
              </div>
              <div class="field">
                <label for="goal-description">설명</label>
                <textarea id="goal-description" name="description" placeholder="왜 중요한지, 어떻게 측정할지 적어보세요."></textarea>
              </div>
              <button class="text-btn primary" type="submit">목표 추가</button>
            </form>
          </div>
        </section>
      </div>
    `;
  }

  function renderGoalRow(goal) {
    const relatedTasks = state.tasks.filter((task) => task.goalId === goal.id);
    const done = relatedTasks.filter((task) => task.done).length;
    const progress = relatedTasks.length ? Math.round((done / relatedTasks.length) * 100) : 0;
    return `
      <div class="list-row compact">
        <div>
          <p class="row-title">${esc(goal.title)}</p>
          <p class="row-meta">${esc(goal.category || "미분류")} · 마감 ${esc(goal.endDate || "없음")} · 할 일 ${done}/${relatedTasks.length}</p>
          <div class="progress" style="margin-top: 8px;"><span style="width:${progress}%"></span></div>
          ${goal.description ? `<p class="note-body">${esc(goal.description)}</p>` : ""}
        </div>
        <button class="icon-btn" data-delete-goal="${attr(goal.id)}" title="목표 삭제">×</button>
      </div>
    `;
  }

  function renderProjectsView() {
    return `
      <div class="view-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">프로젝트</h2>
              <p class="panel-subtitle">목표를 실행 가능한 작업 묶음으로 관리합니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="list">
              ${state.projects.length ? state.projects.map(renderProjectBlock).join("") : `<div class="empty">아직 프로젝트가 없습니다.</div>`}
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">프로젝트 추가</h2>
              <p class="panel-subtitle">목표와 연결하면 주간 계획에서 함께 보입니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <form class="form-grid" data-form="project">
              <div class="field">
                <label for="project-title">프로젝트명</label>
                <input id="project-title" name="title" required placeholder="예: 상반기 포트폴리오 정리">
              </div>
              <div class="form-row">
                <div class="field">
                  <label for="project-goal">연결 목표</label>
                  <select id="project-goal" name="goalId">
                    <option value="">연결 없음</option>
                    ${state.goals.map((goal) => `<option value="${attr(goal.id)}">${esc(goal.title)}</option>`).join("")}
                  </select>
                </div>
                <div class="field">
                  <label for="project-due">마감</label>
                  <input id="project-due" name="dueDate" type="date" value="${attr(addDays(state.currentDate, 14))}">
                </div>
              </div>
              <div class="field">
                <label for="project-description">설명</label>
                <textarea id="project-description" name="description" placeholder="결과물과 완료 기준을 적습니다."></textarea>
              </div>
              <button class="text-btn primary" type="submit">프로젝트 추가</button>
            </form>
          </div>
        </section>
      </div>
    `;
  }

  function renderProjectBlock(project) {
    const tasks = state.tasks.filter((task) => task.projectId === project.id);
    const goal = goalById(project.goalId);
    return `
      <div class="project-block">
        ${renderProjectRow(project)}
        <div class="tag-line">
          ${goal ? `<span class="tag">목표: ${esc(goal.title)}</span>` : `<span class="tag">목표 없음</span>`}
          <span class="tag">완료 ${tasks.filter((task) => task.done).length}/${tasks.length}</span>
        </div>
        <div class="list" style="margin-top: 12px;">
          ${tasks.slice(0, 4).map(renderTaskRow).join("") || `<div class="empty">프로젝트 할 일이 없습니다.</div>`}
        </div>
        <div style="margin-top: 12px;">
          ${renderTaskForm(project.dueDate || state.currentDate, project.id)}
        </div>
      </div>
    `;
  }

  function renderProjectRow(project) {
    return `
      <div class="list-row compact">
        <div>
          <p class="row-title">${esc(project.title)}</p>
          <p class="row-meta">마감 ${esc(project.dueDate || "없음")}</p>
          ${project.description ? `<p class="note-body">${esc(project.description)}</p>` : ""}
        </div>
        <button class="icon-btn" data-delete-project="${attr(project.id)}" title="프로젝트 삭제">×</button>
      </div>
    `;
  }

  function renderBinderView() {
    return `
      <div class="view-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">서브 바인더 노트</h2>
              <p class="panel-subtitle">일정과 프로젝트에서 나온 기록을 지식으로 모읍니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="list">
              ${state.notes.length ? state.notes.map(renderNoteRow).join("") : `<div class="empty">아직 저장된 노트가 없습니다.</div>`}
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">노트 추가</h2>
              <p class="panel-subtitle">독서, 회의, 강의, 아이디어를 분류해 둡니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <form class="form-grid" data-form="note">
              <div class="field">
                <label for="note-title">제목</label>
                <input id="note-title" name="title" required placeholder="예: 주간 리뷰에서 발견한 패턴">
              </div>
              <div class="form-row">
                <div class="field">
                  <label for="note-source">출처</label>
                  <select id="note-source" name="source">
                    <option value="memo">메모</option>
                    <option value="book">독서</option>
                    <option value="lecture">강의</option>
                    <option value="meeting">회의</option>
                    <option value="idea">아이디어</option>
                  </select>
                </div>
                <div class="field">
                  <label for="note-project">프로젝트</label>
                  <select id="note-project" name="projectId">
                    <option value="">연결 없음</option>
                    ${state.projects.map((project) => `<option value="${attr(project.id)}">${esc(project.title)}</option>`).join("")}
                  </select>
                </div>
              </div>
              <div class="field">
                <label for="note-tags">태그</label>
                <input id="note-tags" name="tags" placeholder="쉼표로 구분">
              </div>
              <div class="field">
                <label for="note-body">본문</label>
                <textarea id="note-body" name="body" required placeholder="기록을 다음 행동으로 연결할 수 있게 적어보세요."></textarea>
              </div>
              <button class="text-btn primary" type="submit">노트 저장</button>
            </form>
          </div>
        </section>
      </div>
    `;
  }

  function renderNoteRow(note) {
    const project = projectById(note.projectId);
    return `
      <div class="list-row compact">
        <div>
          <p class="row-title">${esc(note.title)}</p>
          <p class="row-meta">${esc(sourceLabel(note.source))}${project ? ` · ${esc(project.title)}` : ""}</p>
          <div class="tag-line">
            ${(note.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}
          </div>
          <p class="note-body">${esc(note.body)}</p>
        </div>
        <button class="icon-btn" data-delete-note="${attr(note.id)}" title="노트 삭제">×</button>
      </div>
    `;
  }

  function sourceLabel(source) {
    return {
      memo: "메모",
      book: "독서",
      lecture: "강의",
      meeting: "회의",
      idea: "아이디어"
    }[source] || "메모";
  }

  function renderReviewView() {
    const date = state.currentDate;
    const daily = ensureDailyLog(date);
    const weekStart = startOfWeek(date);
    const weekly = ensureWeeklyReview(weekStart);
    return `
      <div class="two-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">일간 리뷰</h2>
              <p class="panel-subtitle">${esc(formatDate(date))}</p>
            </div>
          </div>
          <div class="panel-body review-box">
            <textarea class="daily-review" data-review-date="${attr(date)}" placeholder="오늘의 회고">${esc(daily.text || "")}</textarea>
            <span class="save-hint">오늘 탭의 회고와 같은 데이터입니다.</span>
          </div>
        </section>
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">주간 리뷰</h2>
              <p class="panel-subtitle">${esc(formatDate(weekStart))} 주</p>
            </div>
          </div>
          <div class="panel-body">
            ${renderWeeklyReviewForm(weekStart, weekly)}
          </div>
        </section>
      </div>
    `;
  }

  function renderStatsView() {
    const weekStart = startOfWeek(state.currentDate);
    const weekEnd = endOfWeek(state.currentDate);
    const weekBlocks = state.blocks.filter((block) => block.date >= weekStart && block.date <= weekEnd);
    const plannedWeekBlocks = weekBlocks.filter((block) => !block.actualOnly && !block.cancelled);
    const allStats = categoryStats(plannedWeekBlocks);
    const goalStats = goalTimeStats(plannedWeekBlocks);
    return `
      <div class="full-grid">
        <div class="three-grid">
          <section class="panel">
            <div class="panel-header"><h2 class="panel-title">이번 주 계획 시간</h2></div>
            <div class="panel-body"><div class="mini-stat"><strong>${minutesToText(totalMinutes(plannedWeekBlocks))}</strong><span>${esc(formatDate(weekStart))}부터 ${esc(formatDate(weekEnd))}</span></div></div>
          </section>
          <section class="panel">
            <div class="panel-header"><h2 class="panel-title">연결된 목표</h2></div>
            <div class="panel-body"><div class="mini-stat"><strong>${new Set(plannedWeekBlocks.map((block) => block.goalId).filter(Boolean)).size}</strong><span>시간 블록과 연결됨</span></div></div>
          </section>
          <section class="panel">
            <div class="panel-header"><h2 class="panel-title">완료한 할 일</h2></div>
            <div class="panel-body"><div class="mini-stat"><strong>${state.tasks.filter((task) => task.done).length}</strong><span>전체 ${state.tasks.length}개 중</span></div></div>
          </section>
        </div>
        <div class="view-grid">
          <section class="panel sheet">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">영역별 시간</h2>
                <p class="panel-subtitle">이번 주 계획 시간 블록 기준입니다.</p>
              </div>
            </div>
            <div class="panel-body">${renderStatsBars(allStats)}</div>
          </section>
          <section class="panel sheet">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">목표별 투입 시간</h2>
                <p class="panel-subtitle">목표와 연결된 계획 시간을 확인합니다.</p>
              </div>
            </div>
            <div class="panel-body">${renderGoalStats(goalStats)}</div>
          </section>
        </div>
      </div>
    `;
  }

  function renderGuideView() {
    return `
      <div class="full-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">주요 기능 예시</h2>
              <p class="panel-subtitle">계획을 세우고, 실행을 덮어쓰고, 체크리스트와 회고로 한 주를 확인하는 흐름입니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="guide-grid">
              ${renderGuideCard("1", "Plan으로 계획하기", "05:00부터 24:00까지 15분 단위", "주간 탭에서 드래그로 계획 시간을 만들고, 필요한 경우 다시 끌어서 시간을 조정합니다.")}
              ${renderGuideCard("2", "Do로 실행 기록하기", "계획을 눌러 실제 실행 작성", "Do 모드에서는 계획 카드를 먼저 크게 확인하고, 클릭해 실행을 저장하면 Plan/Do가 나란히 정리됩니다.")}
              ${renderGuideCard("3", "체크리스트 분리", "주간 체크와 일일 체크를 따로 관리", "일일 체크박스는 하루마다, 주간 체크박스는 한 주 동안 확인할 항목으로 분리해 관리합니다.")}
              ${renderGuideCard("4", "오늘 상세 기록", "필요한 일정만 메모와 첨부 추가", "오늘 탭에서 일정을 선택하면 옆 패널에서 세부 메모, 사진, 자료를 그 일정에 연결해 남길 수 있습니다.")}
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">표시 방식</h2>
              <p class="panel-subtitle">Do를 저장한 일정은 실행 내용이 중심이 되고, Plan은 계획한 시간만 좁게 붙어 확인됩니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="guide-sample compact-schedule-sample">
              <div class="sample-plan-rail"><strong>05:00</strong><span>07:00</span></div>
              <div class="sample-do-card">
                <strong>기상, 아침식사, 새벽기도</strong>
                <span>05:00-07:00</span>
              </div>
              <div class="sample-plan-rail blue"><strong>07:00</strong><span>09:30</span></div>
              <div class="sample-do-card blue">
                <strong>자전거 출근, 샤워</strong>
                <span>07:00-09:30</span>
              </div>
            </div>
          </div>
        </section>
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">카테고리 기준</h2>
              <p class="panel-subtitle">일정을 입력할 때 어느 카테고리에 넣을지 빠르게 확인합니다.</p>
            </div>
          </div>
          <div class="panel-body">
            ${renderCategoryGuideTable()}
          </div>
        </section>
      </div>
    `;
  }

  function renderCategoryGuideTable() {
    const rows = [
      ["주업무", "연구, 수업, 강의, 논문, 프로젝트 핵심 작업"],
      ["보조업무", "행정, 정리, 이메일, 자료 준비, 회의 준비"],
      ["개인업무", "은행, 병원, 예약, 개인 처리 일"],
      ["가정", "아이들, 집안일, 가족 일정"],
      ["신앙", "예배, 기도, 묵상, 공동체 활동"],
      ["휴먼 네트워크", "만남, 연락, 관계 관리, 상담"],
      ["자기개발/관리", "운동, 독서, 공부, 영어, 코딩, 식사, 수면, 휴식, 산책, 낮잠"]
    ];
    return `
      <div class="category-guide-table" role="table" aria-label="카테고리 기준표">
        <div class="category-guide-row category-guide-head" role="row">
          <strong role="columnheader">카테고리</strong>
          <strong role="columnheader">포함되는 일정</strong>
        </div>
        ${rows.map(([category, description]) => `
          <div class="category-guide-row" role="row">
            <span role="cell">${esc(category)}</span>
            <p role="cell">${esc(description)}</p>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderGuideCard(number, title, example, body) {
    return `
      <article class="guide-card">
        <span class="guide-number">${esc(number)}</span>
        <h3>${esc(title)}</h3>
        <strong>${esc(example)}</strong>
        <p>${esc(body)}</p>
      </article>
    `;
  }

  function renderStatsBars(stats) {
    const max = Math.max(...stats.map((item) => item.minutes), 1);
    const visible = stats.filter((item) => item.minutes > 0);
    if (!visible.length) return `<div class="empty">아직 이번 주 시간 블록이 없습니다.</div>`;
    return visible.map((item) => `
      <div class="stat-row">
        <div class="stat-label"><span class="status-dot" style="background:${attr(item.color)}"></span>${esc(item.name)}</div>
        <div class="stat-bar"><span style="width:${Math.round((item.minutes / max) * 100)}%; background:${attr(item.color)}"></span></div>
        <div class="stat-value">${esc(minutesToText(item.minutes))}</div>
      </div>
    `).join("");
  }

  function renderPlanActualStats(stats, options = {}) {
    const base = options.includeZero ? stats : stats.filter((item) => item.planned > 0 || item.actual > 0);
    const visible = base.slice(0, options.limit || base.length);
    const max = Math.max(...visible.flatMap((item) => [item.planned, item.actual]), 1);
    if (!visible.length) return `<div class="empty">${esc(options.emptyText || "아직 이번 주 시간 블록이 없습니다.")}</div>`;
    return `
      <div class="dual-stat-list ${options.compact ? "is-compact" : ""} ${options.hideKinds ? "is-kind-hidden" : ""}">
        ${visible.map((item) => `
          <div class="dual-stat-row ${options.hideLabels ? "is-label-hidden" : ""}" style="--stat-color:${attr(item.color)}" title="${attr(`${item.name} 계획 ${minutesToShortText(item.planned)} 수행 ${minutesToShortText(item.actual)}`)}">
            <div class="dual-stat-label ${options.hideLabels ? "is-color-only" : ""}"><span class="status-dot" style="background:${attr(item.color)}"></span>${options.hideLabels ? "" : esc(item.name)}</div>
            <div class="dual-stat-lines">
              <div class="dual-stat-line">
                ${options.hideKinds ? "" : `<span class="dual-stat-kind">계획</span>`}
                <div class="stat-bar"><span style="width:${Math.round((item.planned / max) * 100)}%; background:${attr(item.color)}"></span></div>
                <strong>${esc(minutesToShortText(item.planned))}</strong>
              </div>
              <div class="dual-stat-line is-actual">
                ${options.hideKinds ? "" : `<span class="dual-stat-kind">수행</span>`}
                <div class="stat-bar"><span style="width:${Math.round((item.actual / max) * 100)}%; background:${attr(item.color)}"></span></div>
                <strong>${esc(minutesToShortText(item.actual))}</strong>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderGoalStats(stats) {
    const max = Math.max(...stats.map((item) => item.minutes), 1);
    const visible = stats.filter((item) => item.minutes > 0);
    if (!visible.length) return `<div class="empty">목표와 연결된 시간이 아직 없습니다.</div>`;
    return visible.map((item) => `
      <div class="stat-row">
        <div class="stat-label">${esc(item.name)}</div>
        <div class="stat-bar"><span style="width:${Math.round((item.minutes / max) * 100)}%; background:${attr(item.color)}"></span></div>
        <div class="stat-value">${esc(minutesToText(item.minutes))}</div>
      </div>
    `).join("");
  }

  function bindEvents() {
    setupWeekTopScroll();

    app.querySelectorAll(".block-memo, .daily-journal, .daily-review, .daily-share-draft").forEach(bindAutoGrowTextarea);

    app.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.view !== "month") monthEditorDate = null;
        setState((draft) => {
          draft.activeView = button.dataset.view;
        });
      });
    });

    app.querySelectorAll("[data-date-shift]").forEach((button) => {
      button.addEventListener("click", () => {
        const direction = Number(button.dataset.dateShift);
        if (state.activeView === "month") monthEditorDate = null;
        setState((draft) => {
          if (draft.activeView === "month") draft.currentDate = addMonths(draft.currentDate, direction);
          else if (draft.activeView === "week") draft.currentDate = addDays(draft.currentDate, direction * 7);
          else draft.currentDate = addDays(draft.currentDate, direction);
        });
      });
    });

    const todayButton = app.querySelector("[data-today]");
    if (todayButton) {
      todayButton.addEventListener("click", () => {
        if (state.activeView === "month") monthEditorDate = null;
        setState((draft) => {
          draft.currentDate = todayISO();
          draft.todayDetailBlockId = "";
        });
      });
    }

    const exportButton = app.querySelector("[data-export]");
    if (exportButton) {
      exportButton.addEventListener("click", exportData);
    }

    const logoutButton = app.querySelector("[data-logout]");
    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        if (remoteSaveTimer) {
          window.clearTimeout(remoteSaveTimer);
          remoteSaveTimer = null;
          await saveRemoteStateNow("저장됨");
        }
        await remoteSavePromise.catch(() => {});
        await supabaseRequest("/auth/v1/logout", { method: "POST" }).catch(() => {});
        clearAuthSession();
        authStatus = "signed-out";
        authMessage = "";
        authError = "";
        syncStatus = "";
        render();
      });
    }

    app.querySelectorAll("[data-select-date]").forEach((button) => {
      button.addEventListener("click", () => {
        const selectedDate = button.dataset.selectDate;
        if (state.activeView === "month") {
          monthEditorDate = selectedDate;
          setState((draft) => {
            draft.currentDate = selectedDate;
          });
          return;
        }
        setState((draft) => {
          draft.currentDate = selectedDate;
          draft.activeView = draft.activeView === "month" ? "month" : "week";
        });
      });
    });

    app.querySelectorAll("[data-close-month-editor]").forEach((button) => {
      button.addEventListener("click", () => {
        monthEditorDate = null;
        render();
      });
    });

    app.querySelectorAll("[data-form]").forEach((form) => {
      form.addEventListener("submit", handleFormSubmit);
    });

    app.querySelectorAll("[data-close-schedule-popup]").forEach((button) => {
      button.addEventListener("click", () => {
        closeSchedulePopup();
      });
    });

    app.querySelectorAll("[data-delete-schedule-popup]").forEach((button) => {
      button.addEventListener("click", () => {
        deleteSchedulePopupTarget();
      });
    });

    app.querySelectorAll("[data-strike-selection]").forEach((button) => {
      button.addEventListener("click", () => {
        const textarea = button.closest(".schedule-popover")?.querySelector('textarea[name="title"]');
        if (!textarea) return;
        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? start;
        const selected = textarea.value.slice(start, end);
        const replacement = selected && selected.startsWith("~~") && selected.endsWith("~~")
          ? selected.slice(2, -2)
          : `~~${selected || ""}~~`;
        textarea.setRangeText(replacement, start, end, selected ? "select" : "end");
        if (!selected) {
          textarea.selectionStart = start + 2;
          textarea.selectionEnd = start + 2;
        }
        textarea.focus();
        autoGrowTextarea(textarea);
      });
    });

    app.querySelectorAll(".popover-categories input").forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) {
          input.checked = true;
          return;
        }
        app.querySelectorAll(".popover-categories input").forEach((other) => {
          if (other !== input) other.checked = false;
        });
      });
    });

    app.querySelectorAll("[data-week-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          draft.weekDrawMode = button.dataset.weekMode;
        });
      });
    });

    app.querySelectorAll("[data-toggle-week-mode]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setState((draft) => {
          draft.weekDrawMode = (draft.weekDrawMode || "plan") === "actual" ? "plan" : "actual";
        });
      });
    });

    app.querySelectorAll(".dont-forget-input").forEach((input) => {
      input.addEventListener("change", () => {
        setState((draft) => {
          const weekStart = input.dataset.weekStart;
          const existing = draft.reviews.weekly[weekStart] || {};
          draft.reviews.weekly[weekStart] = {
            ...existing,
            dontForget: input.value.trim()
          };
        });
      });
    });

    app.querySelectorAll(".task-status").forEach((input) => {
      input.addEventListener("click", () => {
        setState((draft) => {
          const task = draft.tasks.find((item) => item.id === input.dataset.taskId);
          if (!task) return;
          task.status = nextCheckStatus(task.status || (task.done ? "done" : "open"));
          task.done = task.status === "done";
        });
      });
    });

    app.querySelectorAll(".task-title-input").forEach((input) => {
      input.addEventListener("change", () => {
        setState((draft) => {
          const task = draft.tasks.find((item) => item.id === input.dataset.taskId);
          if (task) task.title = input.value.trim() || task.title;
        });
      });
    });

    app.querySelectorAll(".daily-check-status").forEach((input) => {
      input.addEventListener("click", () => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, input.dataset.checkDate);
          const item = log.checks[Number(input.dataset.checkIndex)];
          if (!item) return;
          item.status = nextCheckStatus(item.status || (item.done ? "done" : "open"));
          item.done = item.status === "done";
        });
      });
    });

    app.querySelectorAll(".daily-check-title").forEach((input) => {
      input.addEventListener("change", () => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, input.dataset.checkDate);
          const item = log.checks[Number(input.dataset.checkIndex)];
          if (item) item.title = input.value.trim() || item.title;
        });
      });
    });

    app.querySelectorAll("[data-delete-daily-check]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, button.dataset.deleteDailyCheck);
          log.checks.splice(Number(button.dataset.checkIndex), 1);
        });
      });
    });

    app.querySelectorAll(".block-done").forEach((input) => {
      input.addEventListener("change", () => {
        setState((draft) => {
          const block = draft.blocks.find((item) => item.id === input.dataset.blockId);
          if (block) block.actualDone = input.checked;
        });
      });
    });

    app.querySelectorAll(".actual-input").forEach((input) => {
      input.addEventListener("change", () => {
        setState((draft) => {
          const block = draft.blocks.find((item) => item.id === input.dataset.blockId);
          if (block) {
            block.actualText = input.value.trim();
            if (block.actualText && !block.actualStart) {
              block.actualStart = block.start;
              block.actualEnd = block.end;
            }
            block.actualDone = blockHasActualLine(block);
          }
        });
      });
    });

    app.querySelectorAll("[data-select-today-block]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          draft.todayDetailBlockId = button.dataset.selectTodayBlock;
        });
      });
    });

    app.querySelectorAll(".block-memo").forEach((textarea) => {
      textarea.addEventListener("change", () => {
        setState((draft) => {
          const block = draft.blocks.find((item) => item.id === textarea.dataset.blockId);
          if (block) block.memoText = textarea.value.trim();
        });
      });
    });

    app.querySelectorAll(".block-photo-input").forEach((input) => {
      input.addEventListener("change", () => {
        handleBlockPhotoUpload(input);
      });
    });

    app.querySelectorAll("[data-delete-block-photo]").forEach((button) => {
      button.addEventListener("click", () => {
        const blockId = button.dataset.deleteBlockPhoto;
        const photoIndex = Number(button.dataset.photoIndex);
        setState((draft) => {
          const block = draft.blocks.find((item) => item.id === blockId);
          if (block && Array.isArray(block.photos)) {
            block.photos.splice(photoIndex, 1);
          }
        });
      });
    });

    app.querySelectorAll(".daily-journal-photo-input").forEach((input) => {
      input.addEventListener("change", () => {
        handleDailyJournalPhotoUpload(input);
      });
    });

    app.querySelectorAll("[data-delete-journal-photo]").forEach((button) => {
      button.addEventListener("click", () => {
        const date = button.dataset.deleteJournalPhoto;
        const photoIndex = Number(button.dataset.photoIndex);
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, date);
          log.photos.splice(photoIndex, 1);
        });
      });
    });

    app.querySelectorAll("[data-open-cancel]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const block = state.blocks.find((item) => item.id === button.dataset.openCancel);
        if (block) window.alert(block.cancelMemo || "취소 메모가 없습니다.");
      });
    });

    app.querySelectorAll("[data-copy-actual]").forEach((segment) => {
      segment.addEventListener("click", (event) => {
        if (segment.dataset.dragged === "true") {
          delete segment.dataset.dragged;
          return;
        }
        if (event.target.closest("input,label,.cancel-memo,[data-open-cancel]")) return;
        createActualFromPlan(segment.dataset.copyActual);
      });
    });

    app.querySelectorAll("[data-create-actual-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        createActualFromPlan(button.dataset.createActualDetail);
      });
    });

    app.querySelectorAll("[data-copy-day-plan]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openPlanCopyPicker(button.dataset.copyDayPlan);
      });
    });

    app.querySelectorAll("[data-close-plan-copy]").forEach((element) => {
      element.addEventListener("click", () => closePlanCopyPicker());
    });

    app.querySelectorAll("[data-plan-copy-month-shift]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!planCopyPicker) return;
        const scrollState = captureScrollState();
        planCopyPicker = {
          ...planCopyPicker,
          month: monthStartISO(addMonths(planCopyPicker.month, Number(button.dataset.planCopyMonthShift)))
        };
        render();
        restoreScrollState(scrollState);
      });
    });

    app.querySelectorAll("[data-plan-copy-target]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!planCopyPicker) return;
        copyDayPlanToDate(planCopyPicker.sourceDate, button.dataset.planCopyTarget);
      });
    });

    app.querySelectorAll("[data-edit-plan]").forEach((segment) => {
      segment.addEventListener("click", (event) => {
        if (segment.dataset.dragged === "true") {
          delete segment.dataset.dragged;
          return;
        }
        if (shouldSuppressSegmentClick(segment.dataset.editPlan, "plan")) return;
        if (event.target.closest("input,label,.cancel-memo,[data-open-cancel]")) return;
        editPlanBlock(segment.dataset.editPlan, event);
      });
    });

    app.querySelectorAll("[data-edit-actual]").forEach((segment) => {
      segment.addEventListener("click", (event) => {
        if (segment.dataset.dragged === "true") {
          delete segment.dataset.dragged;
          return;
        }
        if (shouldSuppressSegmentClick(segment.dataset.editActual, "actual")) return;
        editActualBlock(segment.dataset.editActual, event);
      });
    });

    app.querySelectorAll(".calendar-segment").forEach((segment) => {
      segment.addEventListener("pointerdown", startEditDrag);
    });

    app.querySelectorAll(".draw-lane[data-draw-lane]").forEach((lane) => {
      lane.addEventListener("pointerdown", startDrawLine);
    });

    app.querySelectorAll(".daily-top").forEach((input) => {
      input.addEventListener("change", () => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, draft.currentDate);
          log.top[Number(input.dataset.topIndex)] = input.value.trim();
        });
      });
    });

    app.querySelectorAll(".daily-review").forEach((textarea) => {
      textarea.addEventListener("change", () => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, textarea.dataset.reviewDate);
          log.text = textarea.value.trim();
        });
      });
    });

    app.querySelectorAll(".daily-journal").forEach((textarea) => {
      textarea.addEventListener("change", () => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, textarea.dataset.journalDate);
          log.text = textarea.value.trim();
        });
      });
    });

    app.querySelectorAll("[data-share-format]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, button.dataset.shareDate);
          log.shareFormat = shareFormatById(button.dataset.shareFormat).id;
        });
      });
    });

    app.querySelectorAll("[data-generate-share-draft]").forEach((button) => {
      button.addEventListener("click", () => {
        const date = button.dataset.generateShareDraft;
        const log = ensureDailyLog(date);
        const format = shareFormatById(log.shareFormat).id;
        const draftText = buildTodayShareDraft(date, log, format);
        setState((draft) => {
          const targetLog = ensureDailyLogMutable(draft, date);
          targetLog.shareFormat = format;
          targetLog.shareDraft = draftText;
        });
      });
    });

    app.querySelectorAll(".daily-share-draft").forEach((textarea) => {
      textarea.addEventListener("change", () => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, textarea.dataset.shareDate);
          log.shareDraft = textarea.value.trim();
        });
      });
    });

    app.querySelectorAll("[data-copy-share-draft]").forEach((button) => {
      button.addEventListener("click", () => {
        copyShareDraft(button.dataset.copyShareDraft);
      });
    });

    [
      ["delete-task", "tasks"],
      ["delete-block", "blocks"],
      ["delete-goal", "goals"],
      ["delete-project", "projects"],
      ["delete-note", "notes"]
    ].forEach(([key, collection]) => {
      app.querySelectorAll(`[data-${key}]`).forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.dataset[toCamel(key)];
          setState((draft) => {
            draft[collection] = draft[collection].filter((item) => item.id !== id);
            if (collection === "goals") {
              draft.projects.forEach((item) => {
                if (item.goalId === id) item.goalId = "";
              });
              draft.tasks.forEach((item) => {
                if (item.goalId === id) item.goalId = "";
              });
              draft.blocks.forEach((item) => {
                if (item.goalId === id) item.goalId = "";
              });
            }
            if (collection === "projects") {
              draft.tasks.forEach((item) => {
                if (item.projectId === id) item.projectId = "";
              });
              draft.blocks.forEach((item) => {
                if (item.projectId === id) item.projectId = "";
              });
              draft.notes.forEach((item) => {
                if (item.projectId === id) item.projectId = "";
              });
            }
          });
        });
      });
    });
  }

  function setupWeekTopScroll() {
    const topScroll = app.querySelector("[data-week-top-scroll]");
    const plannerScroll = app.querySelector(".week-planner-scroll");
    const topInner = topScroll?.querySelector(".week-top-scroll-inner");
    if (!topScroll || !plannerScroll || !topInner) return;
    topInner.style.width = `${plannerScroll.scrollWidth}px`;
    topScroll.scrollLeft = plannerScroll.scrollLeft;
    let syncing = false;
    const sync = (from, to) => {
      if (syncing) return;
      syncing = true;
      to.scrollLeft = from.scrollLeft;
      window.requestAnimationFrame(() => {
        syncing = false;
      });
    };
    topScroll.addEventListener("scroll", () => sync(topScroll, plannerScroll));
    plannerScroll.addEventListener("scroll", () => sync(plannerScroll, topScroll));
  }

  function startDrawLine(event) {
    if (event.button !== 0) return;
    if (event.target.closest(".time-segment,input,button,label,textarea,select")) return;
    const lane = event.currentTarget;
    const start = minutesFromPointer(lane, event);
    const preview = document.createElement("div");
    preview.className = `draw-preview ${lane.dataset.drawLane === "actual" ? "actual-preview" : "plan-preview"}`;
    lane.appendChild(preview);
    drawState = {
      lane,
      preview,
      type: lane.dataset.drawLane,
      date: lane.dataset.date,
      start,
      end: start,
      pointerId: event.pointerId
    };
    updateDrawPreview(event);
    lane.setPointerCapture(event.pointerId);
    lane.addEventListener("pointermove", updateDrawPreview);
    lane.addEventListener("pointerup", finishDrawLine);
    lane.addEventListener("pointercancel", cancelDrawLine);
    event.preventDefault();
  }

  function openSchedulePopup(config) {
    const scrollState = captureScrollState();
    planCopyPicker = null;
    schedulePopup = {
      mode: config.mode,
      action: config.action,
      blockId: config.blockId || "",
      date: config.date || state.currentDate,
      start: config.start || "",
      end: config.end || "",
      title: config.title || "",
      categoryId: normalizeCategoryId(config.categoryId),
      lockCategory: Boolean(config.lockCategory),
      x: 24,
      y: 24
    };
    const position = popupPosition(config.x || 0, config.y || 0);
    schedulePopup.x = position.x;
    schedulePopup.y = position.y;
    render();
    restoreScrollState(scrollState);
    setTimeout(() => {
      const field = app.querySelector(".schedule-popover textarea");
      if (field) field.focus();
    }, 0);
  }

  function popupPosition(x, y) {
    const width = 560;
    const height = 580;
    const margin = 16;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = viewport?.width || window.innerWidth || width + margin * 2;
    const viewportHeight = viewport?.height || window.innerHeight || height + margin * 2;
    const bottomReserve = 96;
    const maxX = Math.max(viewportLeft + margin, viewportLeft + viewportWidth - width - margin);
    const maxY = Math.max(viewportTop + margin, viewportTop + viewportHeight - bottomReserve - height - margin);
    return {
      x: Math.max(viewportLeft + margin, Math.min(x + 12, maxX)),
      y: Math.max(viewportTop + margin, Math.min(y + 12, maxY))
    };
  }

  function closeSchedulePopup() {
    const scrollState = captureScrollState();
    schedulePopup = null;
    render();
    restoreScrollState(scrollState);
  }

  function startEditDrag(event) {
    if (event.button !== 0) return;
    if (event.target.closest("input,button,label,.cancel-memo,[data-open-cancel]")) return;
    const segment = event.currentTarget;
    if (segment.classList.contains("today-calendar-segment")) {
      event.stopPropagation();
      return;
    }
    if (segment.classList.contains("is-readonly")) {
      event.stopPropagation();
      return;
    }
    const lane = segment.closest(".draw-lane");
    const block = state.blocks.find((item) => item.id === segment.dataset.segmentId);
    if (!lane || !block) return;

    const kind = segment.dataset.segmentKind;
    const edge = event.target.dataset.resizeEdge;
    const mode = edge === "start" ? "resize-start" : edge === "end" ? "resize-end" : "move";
    const startTime = kind === "actual" ? (block.actualStart || block.start) : block.start;
    const endTime = kind === "actual" ? (block.actualEnd || block.end) : block.end;
    editDragState = {
      blockId: block.id,
      kind,
      mode,
      lane,
      segment,
      pointerId: event.pointerId,
      startPointer: minutesFromPointer(lane, event),
      originalStart: minutesFromTime(startTime),
      originalEnd: minutesFromTime(endTime),
      moved: false
    };
    segment.setPointerCapture(event.pointerId);
    segment.addEventListener("pointermove", updateEditDrag);
    segment.addEventListener("pointerup", finishEditDrag);
    segment.addEventListener("pointercancel", cancelEditDrag);
    event.stopPropagation();
    event.preventDefault();
  }

  function updateEditDrag(event) {
    if (!editDragState) return;
    const pointer = minutesFromPointer(editDragState.lane, event);
    const next = nextEditDragRange(pointer);
    const pointerDelta = Math.abs(pointer - editDragState.startPointer);
    if (pointerDelta >= SNAP_MINUTES) editDragState.moved = true;
    updateSegmentLivePosition(editDragState.segment, next.start, next.end);
  }

  function finishEditDrag(event) {
    if (!editDragState) return;
    updateEditDrag(event);
    const next = nextEditDragRange(minutesFromPointer(editDragState.lane, event));
    const drag = editDragState;
    drag.segment.removeEventListener("pointermove", updateEditDrag);
    drag.segment.removeEventListener("pointerup", finishEditDrag);
    drag.segment.removeEventListener("pointercancel", cancelEditDrag);
    if (drag.segment.hasPointerCapture(drag.pointerId)) {
      drag.segment.releasePointerCapture(drag.pointerId);
    }
    if (drag.moved) {
      drag.segment.dataset.dragged = "true";
      suppressSegmentClick = {
        blockId: drag.blockId,
        kind: drag.kind,
        until: Date.now() + 900
      };
      setState((draft) => {
        const target = draft.blocks.find((item) => item.id === drag.blockId);
        if (!target) return;
        const start = timeFromMinutes(next.start);
        const end = timeFromMinutes(next.end);
        if (drag.kind === "actual") {
          target.actualStart = start;
          target.actualEnd = end;
          target.actualDone = true;
          if (target.actualOnly) {
            target.start = start;
            target.end = end;
          }
        } else {
          target.start = start;
          target.end = end;
        }
      });
      event.preventDefault();
      event.stopPropagation();
    }
    editDragState = null;
  }

  function shouldSuppressSegmentClick(blockId, kind) {
    if (!suppressSegmentClick) return false;
    if (Date.now() > suppressSegmentClick.until) {
      suppressSegmentClick = null;
      return false;
    }
    const shouldSuppress = suppressSegmentClick.blockId === blockId && suppressSegmentClick.kind === kind;
    if (shouldSuppress) suppressSegmentClick = null;
    return shouldSuppress;
  }

  function cancelEditDrag() {
    if (!editDragState) return;
    editDragState.segment.removeEventListener("pointermove", updateEditDrag);
    editDragState.segment.removeEventListener("pointerup", finishEditDrag);
    editDragState.segment.removeEventListener("pointercancel", cancelEditDrag);
    editDragState = null;
    render();
  }

  function nextEditDragRange(pointer) {
    const drag = editDragState;
    const min = DAY_START_HOUR * 60;
    const max = DAY_END_HOUR * 60;
    const minDuration = SNAP_MINUTES;
    let start = drag.originalStart;
    let end = drag.originalEnd;
    if (drag.mode === "move") {
      const duration = end - start;
      let delta = pointer - drag.startPointer;
      start = Math.max(min, Math.min(max - duration, drag.originalStart + delta));
      end = start + duration;
    } else if (drag.mode === "resize-start") {
      start = Math.max(min, Math.min(pointer, drag.originalEnd - minDuration));
    } else {
      end = Math.min(max, Math.max(pointer, drag.originalStart + minDuration));
    }
    return { start, end };
  }

  function updateSegmentLivePosition(segment, start, end) {
    segment.style.top = `${linePercent(timeFromMinutes(start))}%`;
    segment.style.height = `${durationPercent(timeFromMinutes(start), timeFromMinutes(end), 0)}%`;
    segment.classList.remove("is-tiny", "is-short", "is-compact");
    const sizeClass = segmentDurationClass(timeFromMinutes(start), timeFromMinutes(end));
    if (sizeClass) segment.classList.add(sizeClass);
    const label = segment.querySelector(".segment-head span");
    if (label) {
      if (segment.dataset.segmentKind === "actual") {
        label.textContent = `${timeFromMinutes(start)}-${timeFromMinutes(end)}`;
      } else {
        label.textContent = `계획 ${timeFromMinutes(start)}-${timeFromMinutes(end)}`;
      }
    }
  }

  function handleBlockPhotoUpload(input) {
    const blockId = input.dataset.blockId;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    Promise.all(files.slice(0, 6).map((file) => readFileAsDataUrl(file).then((data) => ({
      name: file.name,
      type: file.type,
      data
    }))))
      .then((attachments) => {
        setState((draft) => {
          const block = draft.blocks.find((item) => item.id === blockId);
          if (block) {
            block.photos = [...(block.photos || []), ...attachments].slice(0, 12);
          }
        });
      })
      .catch(() => {
        window.alert("첨부 파일을 불러오지 못했습니다.");
      });
  }

  function handleDailyJournalPhotoUpload(input) {
    const date = input.dataset.journalDate || state.currentDate;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    Promise.all(files.slice(0, 8).map((file) => readFileAsDataUrl(file).then((data) => ({
      name: file.name,
      type: file.type,
      data,
      createdAt: new Date().toISOString()
    }))))
      .then((photos) => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, date);
          log.photos = [...(log.photos || []), ...photos].slice(0, 24);
        });
      })
      .catch(() => {
        window.alert("일기 사진을 불러오지 못했습니다.");
      });
  }

  function copyShareDraft(date) {
    const log = ensureDailyLog(date);
    const text = (log.shareDraft || buildTodayShareDraft(date, log, log.shareFormat)).trim();
    if (!text) {
      window.alert("복사할 공유글 초안이 없습니다.");
      return;
    }
    copyTextToClipboard(text)
      .then(() => window.alert("공유글 초안을 복사했습니다."))
      .catch(() => window.alert("복사하지 못했습니다. 초안 내용을 직접 선택해서 복사해 주세요."));
  }

  function copyTextToClipboard(text) {
    if (window.navigator?.clipboard?.writeText) {
      return window.navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        ok ? resolve() : reject(new Error("copy command failed"));
      } catch (error) {
        reject(error);
      }
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function updateDrawPreview(event) {
    if (!drawState) return;
    drawState.end = minutesFromPointer(drawState.lane, event);
    const start = Math.min(drawState.start, drawState.end);
    const end = Math.max(drawState.start, drawState.end);
    const safeEnd = end === start ? Math.min(start + SNAP_MINUTES, DAY_END_HOUR * 60) : end;
    const top = ((start - DAY_START_HOUR * 60) / ((DAY_END_HOUR - DAY_START_HOUR) * 60)) * 100;
    const height = ((safeEnd - start) / ((DAY_END_HOUR - DAY_START_HOUR) * 60)) * 100;
    drawState.preview.style.top = `${top}%`;
    drawState.preview.style.height = `${height}%`;
  }

  function finishDrawLine(event) {
    if (!drawState) return;
    updateDrawPreview(event);
    const lane = drawState.lane;
    lane.removeEventListener("pointermove", updateDrawPreview);
    lane.removeEventListener("pointerup", finishDrawLine);
    lane.removeEventListener("pointercancel", cancelDrawLine);
    if (lane.hasPointerCapture(drawState.pointerId)) {
      lane.releasePointerCapture(drawState.pointerId);
    }

    let start = Math.min(drawState.start, drawState.end);
    let end = Math.max(drawState.start, drawState.end);
    if (start >= DAY_END_HOUR * 60) start = DAY_END_HOUR * 60 - SNAP_MINUTES;
    if (end === start) end = Math.min(start + SNAP_MINUTES, DAY_END_HOUR * 60);
    if (end - start < SNAP_MINUTES) end = Math.min(start + SNAP_MINUTES, DAY_END_HOUR * 60);
    const startTime = timeFromMinutes(start);
    const endTime = timeFromMinutes(end);
    const type = drawState.type;
    const date = drawState.date;
    drawState.preview.remove();
    drawState = null;

    openSchedulePopup({
      mode: type,
      action: "create",
      date,
      start: startTime,
      end: endTime,
      title: "",
      categoryId: "mainWork",
      x: event.clientX,
      y: event.clientY
    });
  }

  function findBestPlanForActual(blocks, date, start, end) {
    const actualStart = minutesFromTime(start);
    const actualEnd = minutesFromTime(end);
    let best = null;
    let bestOverlap = 0;
    blocks.forEach((block) => {
      if (block.date !== date || block.actualOnly || block.cancelled) return;
      const planStart = minutesFromTime(block.start);
      const planEnd = minutesFromTime(block.end);
      const overlap = Math.max(0, Math.min(actualEnd, planEnd) - Math.max(actualStart, planStart));
      if (overlap > bestOverlap) {
        best = block;
        bestOverlap = overlap;
      }
    });
    return bestOverlap > 0 ? best : null;
  }

  function openPlanCopyPicker(sourceDate) {
    const plans = state.blocks.filter((block) => {
      return block.date === sourceDate && !block.actualOnly && !block.cancelled;
    });
    if (!plans.length) {
      window.alert("복사할 Plan 일정이 없습니다.");
      return;
    }
    const scrollState = captureScrollState();
    schedulePopup = null;
    planCopyPicker = {
      sourceDate,
      month: monthStartISO(sourceDate)
    };
    render();
    restoreScrollState(scrollState);
  }

  function closePlanCopyPicker() {
    const scrollState = captureScrollState();
    planCopyPicker = null;
    render();
    restoreScrollState(scrollState);
  }

  function copyDayPlanToDate(sourceDate, targetDate) {
    const nextDate = String(targetDate || "").trim();
    if (!isValidISODate(nextDate)) {
      window.alert("날짜 형식이 올바르지 않습니다. 예: 2026-05-01");
      return;
    }
    const plans = state.blocks.filter((block) => {
      return block.date === sourceDate && !block.actualOnly && !block.cancelled;
    });
    if (!plans.length) {
      window.alert("복사할 Plan 일정이 없습니다.");
      return;
    }
    planCopyPicker = null;
    setState((draft) => {
      plans.forEach((block) => {
        draft.blocks.push({
          ...block,
          id: uid("block"),
          date: nextDate,
          status: "planned",
          actualStart: "",
          actualEnd: "",
          actualText: "",
          actualDone: false,
          actualOnly: false,
          actualCategoryId: block.categoryId,
          cancelled: false,
          cancelMemo: "",
          memoText: "",
          photos: []
        });
      });
      draft.currentDate = nextDate;
    });
  }

  function clearActualFromBlock(block) {
    block.actualStart = "";
    block.actualEnd = "";
    block.actualText = "";
    block.actualDone = false;
    block.actualCategoryId = block.categoryId;
  }

  function deleteSchedulePopupTarget() {
    if (!schedulePopup || schedulePopup.action !== "edit") return;
    const popup = { ...schedulePopup };
    schedulePopup = null;
    setState((draft) => {
      const index = draft.blocks.findIndex((item) => item.id === popup.blockId);
      if (index === -1) return;
      const target = draft.blocks[index];
      if (popup.mode === "actual") {
        if (target.actualOnly) {
          draft.blocks.splice(index, 1);
        } else {
          clearActualFromBlock(target);
        }
      } else {
        draft.blocks.splice(index, 1);
      }
      draft.currentDate = popup.date || target.date || draft.currentDate;
    });
  }

  function cancelDrawLine() {
    if (!drawState) return;
    drawState.preview.remove();
    drawState.lane.removeEventListener("pointermove", updateDrawPreview);
    drawState.lane.removeEventListener("pointerup", finishDrawLine);
    drawState.lane.removeEventListener("pointercancel", cancelDrawLine);
    drawState = null;
  }

  function minutesFromPointer(lane, event) {
    const rect = lane.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const minutes = DAY_START_HOUR * 60 + ratio * ((DAY_END_HOUR - DAY_START_HOUR) * 60);
    return clampDayMinutes(snapMinutes(minutes));
  }

  function editPlanBlock(id, event) {
    const block = state.blocks.find((item) => item.id === id);
    if (!block) return;
    openSchedulePopup({
      mode: "plan",
      action: "edit",
      blockId: id,
      date: block.date,
      start: block.start,
      end: block.end,
      title: block.title,
      categoryId: block.categoryId,
      x: event?.clientX || 0,
      y: event?.clientY || 0
    });
  }

  function editActualBlock(id, event) {
    const block = state.blocks.find((item) => item.id === id);
    if (!block) return;
    openSchedulePopup({
      mode: "actual",
      action: "edit",
      blockId: id,
      date: block.date,
      start: block.actualStart || block.start,
      end: block.actualEnd || block.end,
      title: block.actualText || block.title,
      categoryId: block.actualCategoryId || block.categoryId,
      x: event?.clientX || 0,
      y: event?.clientY || 0
    });
  }

  function createActualFromPlan(id) {
    setState((draft) => {
      const block = draft.blocks.find((item) => item.id === id);
      if (!block) return;
      block.actualStart = block.start;
      block.actualEnd = block.end;
      block.actualText = block.actualText || block.title;
      block.actualCategoryId = block.actualCategoryId || block.categoryId;
      block.actualDone = true;
      draft.currentDate = block.date || draft.currentDate;
      draft.todayDetailBlockId = block.id;
    });
  }

  function normalizeTimeInput(value, fallback) {
    const match = String(value || "").trim().match(/^([01]?\d|2[0-4]):([0-5]\d)$/);
    if (!match) return fallback;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour === 24 && minute !== 0) return fallback;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function normalizeScheduleRange(startValue, endValue) {
    const dayStart = DAY_START_HOUR * 60;
    const dayEnd = DAY_END_HOUR * 60;
    let start = snapMinutes(minutesFromTime(normalizeTimeInput(startValue, "09:00")));
    let end = snapMinutes(minutesFromTime(normalizeTimeInput(endValue, "10:00")));
    start = Math.max(dayStart, Math.min(dayEnd - SNAP_MINUTES, start));
    end = Math.max(start + SNAP_MINUTES, Math.min(dayEnd, end));
    return {
      start: timeFromMinutes(start),
      end: timeFromMinutes(end)
    };
  }

  function toCamel(key) {
    return key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const type = form.dataset.form;
    const data = Object.fromEntries(new FormData(form).entries());

    if (type === "schedule-popup") {
      if (!schedulePopup) return;
      const popup = { ...schedulePopup };
      const title = String(data.title || "").trim();
      const categoryId = normalizeCategoryId(data.categoryId || popup.categoryId);
      const range = normalizeScheduleRange(data.start || popup.start, data.end || popup.end);
      if (!title) return;
      schedulePopup = null;
      setState((draft) => {
        if (popup.action === "edit") {
          const target = draft.blocks.find((item) => item.id === popup.blockId);
          if (!target) return;
          if (popup.mode === "actual") {
            target.actualText = title;
            target.actualCategoryId = categoryId;
            target.actualDone = true;
            target.actualStart = range.start;
            target.actualEnd = range.end;
            if (target.actualOnly) {
              target.title = title;
              target.categoryId = categoryId;
              target.start = range.start;
              target.end = range.end;
            }
          } else {
            target.title = title;
            target.categoryId = categoryId;
            target.start = range.start;
            target.end = range.end;
            if (!blockHasActualLine(target) && !target.actualOnly) {
              target.actualCategoryId = categoryId;
            }
          }
          draft.currentDate = target.date || popup.date;
          return;
        }

        if (popup.mode === "plan") {
          draft.blocks.push({
            id: uid("block"),
            title,
            date: popup.date,
            start: range.start,
            end: range.end,
            categoryId,
            actualCategoryId: categoryId,
            goalId: "",
            projectId: "",
            status: "planned",
            actualStart: "",
            actualEnd: "",
            actualText: "",
            actualDone: false,
            actualOnly: false,
            cancelled: false,
            cancelMemo: "",
            memoText: "",
            photos: []
          });
          draft.currentDate = popup.date;
          return;
        }

        draft.blocks.push({
          id: uid("block"),
          title,
          date: popup.date,
          start: range.start,
          end: range.end,
          categoryId,
          actualCategoryId: categoryId,
          goalId: "",
          projectId: "",
          status: "actual",
          actualStart: range.start,
          actualEnd: range.end,
          actualText: title,
          actualDone: true,
          actualOnly: true,
          cancelled: false,
          cancelMemo: "",
          memoText: "",
          photos: []
        });
        draft.currentDate = popup.date;
      });
      return;
    }

    if (type === "schedule") {
      const range = normalizeScheduleRange(data.start, data.end);
      setState((draft) => {
        draft.blocks.push({
          id: uid("block"),
          title: data.title.trim(),
          date: data.date,
          start: range.start,
          end: range.end,
          categoryId: normalizeCategoryId(data.categoryId),
          actualCategoryId: normalizeCategoryId(data.categoryId),
          goalId: data.goalId,
          projectId: data.projectId,
          status: "planned",
          actualStart: "",
          actualEnd: "",
          actualText: "",
          actualDone: false,
          actualOnly: false,
          cancelled: false,
          cancelMemo: "",
          memoText: "",
          photos: []
        });
        draft.currentDate = data.date;
      });
      return;
    }

    if (type === "daily-check") {
      setState((draft) => {
        const log = ensureDailyLogMutable(draft, form.dataset.checkDate || draft.currentDate);
        log.checks.push({
          title: data.title.trim(),
          status: "open",
          done: false
        });
      });
      return;
    }

    if (type === "task") {
      const project = projectById(data.projectId);
      setState((draft) => {
        draft.tasks.push({
          id: uid("task"),
          title: data.title.trim(),
          projectId: data.projectId || "",
          goalId: project?.goalId || "",
          dueDate: data.dueDate || draft.currentDate,
          weekStart: data.weekStart || startOfWeek(data.dueDate || draft.currentDate),
          scope: data.scope || "work",
          priority: "normal",
          status: "open",
          done: false
        });
      });
      return;
    }

    if (type === "goal") {
      setState((draft) => {
        draft.goals.push({
          id: uid("goal"),
          title: data.title.trim(),
          category: data.category.trim(),
          description: data.description.trim(),
          endDate: data.endDate,
          status: "active"
        });
      });
      return;
    }

    if (type === "project") {
      setState((draft) => {
        draft.projects.push({
          id: uid("project"),
          title: data.title.trim(),
          goalId: data.goalId,
          description: data.description.trim(),
          dueDate: data.dueDate,
          status: "active"
        });
      });
      return;
    }

    if (type === "note") {
      setState((draft) => {
        draft.notes.unshift({
          id: uid("note"),
          title: data.title.trim(),
          source: data.source,
          projectId: data.projectId,
          tags: data.tags.split(",").map((item) => item.trim()).filter(Boolean),
          body: data.body.trim(),
          createdAt: new Date().toISOString()
        });
      });
      return;
    }

    if (type === "paper-week") {
      const weekStart = form.dataset.weekStart;
      const businessObjectives = Array.from({ length: 5 }, (_, idx) => ({
        text: (data[`businessObjectives${idx}`] || "").trim(),
        done: data[`businessObjectivesDone${idx}`] === "on"
      }));
      const personalObjectives = Array.from({ length: 5 }, (_, idx) => ({
        text: (data[`personalObjectives${idx}`] || "").trim(),
        done: data[`personalObjectivesDone${idx}`] === "on"
      }));
      const habits = Array.from({ length: 4 }, (_, row) => ({
        name: (data[`habitName${row}`] || "").trim(),
        days: Array.from({ length: 7 }, (_, col) => data[`habit${row}_${col}`] === "on")
      }));
      setState((draft) => {
        const existing = draft.reviews.weekly[weekStart] || {};
        draft.reviews.weekly[weekStart] = {
          ...existing,
          dontForget: (data.dontForget || "").trim(),
          businessObjectives,
          personalObjectives,
          meetingNotes: (data.meetingNotes || "").trim(),
          habits,
          thanks: (data.thanks || "").trim()
        };
      });
      return;
    }

    if (type === "weekly-review") {
      const weekStart = form.dataset.weekStart;
      setState((draft) => {
        const existing = draft.reviews.weekly[weekStart] || {};
        draft.reviews.weekly[weekStart] = {
          ...existing,
          wins: data.wins.trim(),
          lessons: data.lessons.trim(),
          next: data.next.trim()
        };
      });
    }
  }

  function ensureDailyLog(date) {
    const existing = state.reviews.daily[date];
    return {
      top: Array.isArray(existing?.top) ? existing.top : ["", "", ""],
      text: existing?.text || "",
      checks: Array.isArray(existing?.checks) ? existing.checks.map(normalizeDailyCheck) : [],
      photos: Array.isArray(existing?.photos) ? existing.photos : [],
      shareDraft: existing?.shareDraft || "",
      shareFormat: shareFormatById(existing?.shareFormat).id
    };
  }

  function ensureDailyLogMutable(draft, date) {
    if (!draft.reviews.daily[date]) {
      draft.reviews.daily[date] = { top: ["", "", ""], text: "", checks: [], photos: [], shareDraft: "", shareFormat: "essay" };
    }
    if (!Array.isArray(draft.reviews.daily[date].top)) {
      draft.reviews.daily[date].top = ["", "", ""];
    }
    if (!Array.isArray(draft.reviews.daily[date].checks)) {
      draft.reviews.daily[date].checks = [];
    }
    if (!Array.isArray(draft.reviews.daily[date].photos)) {
      draft.reviews.daily[date].photos = [];
    }
    draft.reviews.daily[date].shareDraft = draft.reviews.daily[date].shareDraft || "";
    draft.reviews.daily[date].shareFormat = shareFormatById(draft.reviews.daily[date].shareFormat).id;
    draft.reviews.daily[date].checks = draft.reviews.daily[date].checks.map(normalizeDailyCheck);
    return draft.reviews.daily[date];
  }

  function ensureWeeklyReview(weekStart) {
    const existing = state.reviews.weekly[weekStart] || {};
    return {
      wins: "",
      lessons: "",
      next: "",
      dontForget: "",
      businessObjectives: [],
      personalObjectives: [],
      meetingNotes: "",
      habits: [],
      thanks: "",
      ...existing
    };
  }

  function blocksForDate(date) {
    return state.blocks
      .filter((block) => block.date === date)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function totalMinutes(blocks) {
    return blocks.reduce((sum, block) => {
      return sum + Math.max(0, minutesFromTime(block.end) - minutesFromTime(block.start));
    }, 0);
  }

  function categoryStats(blocks) {
    return categories.map((category) => {
      const minutes = totalMinutes(blocks.filter((block) => block.categoryId === category.id));
      return { ...category, minutes };
    });
  }

  function categoryPlanActualStats(blocks) {
    return categories.map((category) => {
      let planned = 0;
      let actual = 0;
      blocks.forEach((block) => {
        if (!block.actualOnly && !block.cancelled && block.categoryId === category.id) {
          planned += Math.max(0, minutesFromTime(block.end) - minutesFromTime(block.start));
        }
        if (blockHasActualLine(block) && (block.actualCategoryId || block.categoryId) === category.id) {
          actual += Math.max(0, minutesFromTime(block.actualEnd || block.end) - minutesFromTime(block.actualStart || block.start));
        }
      });
      return { ...category, planned, actual, total: planned + actual };
    });
  }

  function goalTimeStats(blocks) {
    const base = state.goals.map((goal, idx) => ({
      id: goal.id,
      name: goal.title,
      color: categories[idx % categories.length].color,
      minutes: 0
    }));
    const unlinked = { id: "", name: "목표 미연결", color: "#667085", minutes: 0 };
    blocks.forEach((block) => {
      const minutes = Math.max(0, minutesFromTime(block.end) - minutesFromTime(block.start));
      const target = base.find((goal) => goal.id === block.goalId) || unlinked;
      target.minutes += minutes;
    });
    return [...base, unlinked];
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `life-binder-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  initializeApp();
})();
