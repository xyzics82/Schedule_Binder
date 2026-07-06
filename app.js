(function () {
  "use strict";
  // build: 20260610-gcal-mobile-1

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
    { id: "today", label: "오늘", icon: "T", tooltip: "오늘 하루의 계획·실행·체크·자전거·회고를 한 화면에서 봅니다." },
    { id: "month", label: "월간", icon: "M", tooltip: "한 달의 큰 흐름과 마감을 봅니다." },
    { id: "inbox", label: "수집함", icon: "✦", tooltip: "떠오르는 아이디어, 읽을 논문, 할 일을 일단 여기에 던져두세요. 정리는 나중에." },
    { id: "research", label: "연구", icon: "R", tooltip: "과제·실험·논문·발표를 마감과 다음 행동 중심으로 관리합니다." },
    { id: "routine", label: "루틴", icon: "∞", tooltip: "자전거, 아이들과 공부처럼 매주 반복할 활동을 체크합니다." },
    { id: "stats", label: "통계", icon: "S", tooltip: "시간이 어디에 쓰였는지, 루틴을 얼마나 지켰는지 확인합니다." },
    { id: "guide", label: "가이드", icon: "?" },
    { id: "settings", label: "설정", icon: "⚙" }
  ];

  const mobileNavIds = ["week", "today", "month", "inbox", "research", "routine"];

  const researchKinds = [
    { id: "grant", label: "과제·보고서", color: "#f2c94c" },
    { id: "experiment", label: "실험·분석", color: "#4dabf7" },
    { id: "paper", label: "논문 작성", color: "#2ec27e" },
    { id: "talk", label: "학회·발표", color: "#ff922b" },
    { id: "etc", label: "기타", color: "#93a1a1" }
  ];

  const inboxKinds = [
    { id: "idea", label: "아이디어", hint: "연구 아이디어, 실험 개선점" },
    { id: "paper", label: "읽을 논문", hint: "제목·DOI·링크만 적어도 충분" },
    { id: "todo", label: "할 일", hint: "아직 날짜를 못 정한 일" },
    { id: "kids", label: "아이·가족", hint: "아이 공부 소재, 가족 약속" },
    { id: "memo", label: "메모", hint: "회의, 대화, 기타 기록" }
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
    return normalizeState(createSeedState());
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
    stravaInit(); // 스트라바 OAuth 리다이렉트 처리 + 자동 동기화 (로그인 여부와 무관)
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
      gcalInit();
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
    const viewAlias = { paper: "week", goals: "research", projects: "research", binder: "inbox", review: "today" };
    const rawView = next.activeView || "week";
    return {
      activeView: viewAlias[rawView] || rawView,
      currentDate: next.currentDate || todayISO(),
      goals: Array.isArray(next.goals) ? next.goals : [],
      projects: Array.isArray(next.projects) ? next.projects : [],
      research: normalizeResearch(next),
      routines: normalizeRoutines(next.routines),
      routineChecks: next.routineChecks && typeof next.routineChecks === "object" ? next.routineChecks : {},
      tasks: Array.isArray(next.tasks) ? next.tasks.map(normalizeTask) : [],
      blocks: Array.isArray(next.blocks) ? next.blocks.map(normalizeBlock) : [],
      notes: Array.isArray(next.notes) ? next.notes.map(normalizeNote) : [],
      reviews: normalizeReviews(next.reviews),
      weekDrawMode: next.weekDrawMode || "plan",
      todayDetailBlockId: next.todayDetailBlockId || "",
      gcalSync: next.gcalSync && typeof next.gcalSync === "object" ? next.gcalSync : {}
    };
  }

  // 구 목표/프로젝트 데이터를 연구 항목으로 1회 이전한다 (id 유지 → 할 일/블록 연결 보존).
  function normalizeResearch(next) {
    if (Array.isArray(next.research)) return next.research.map(normalizeResearchItem);
    const migrated = [];
    (Array.isArray(next.projects) ? next.projects : []).forEach((project) => {
      migrated.push(normalizeResearchItem({
        id: project.id,
        title: project.title,
        kind: "etc",
        status: "active",
        dueDate: project.dueDate || "",
        nextAction: "",
        description: project.description || ""
      }));
    });
    (Array.isArray(next.goals) ? next.goals : []).forEach((goal) => {
      migrated.push(normalizeResearchItem({
        id: goal.id,
        title: goal.title,
        kind: "etc",
        status: goal.status === "done" ? "done" : "active",
        dueDate: goal.endDate || "",
        nextAction: "",
        description: goal.description || ""
      }));
    });
    return migrated;
  }

  function normalizeResearchItem(item) {
    return {
      id: item.id || uid("research"),
      title: item.title || "제목 없음",
      kind: researchKinds.some((kind) => kind.id === item.kind) ? item.kind : "etc",
      status: item.status === "done" ? "done" : "active",
      dueDate: item.dueDate || "",
      nextAction: item.nextAction || "",
      description: item.description || "",
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  function defaultRoutines() {
    return [
      { id: "routine-bike", name: "자전거 타기", emoji: "🚴", target: 3 },
      { id: "routine-kids", name: "아이들과 공부", emoji: "📖", target: 5 },
      { id: "routine-paper", name: "논문·자료 읽기", emoji: "📄", target: 5 },
      { id: "routine-body", name: "스트레칭·근력", emoji: "💪", target: 3 }
    ];
  }

  function normalizeRoutines(routines) {
    if (!Array.isArray(routines) || !routines.length) return defaultRoutines();
    return routines.map((routine) => ({
      id: routine.id || uid("routine"),
      name: routine.name || "루틴",
      emoji: routine.emoji || "✓",
      target: Math.min(7, Math.max(1, Number(routine.target) || 3))
    }));
  }

  function normalizeNote(note) {
    const sourceAlias = { book: "paper", lecture: "memo", meeting: "memo" };
    const source = sourceAlias[note.source] || note.source;
    return {
      ...note,
      source: inboxKinds.some((kind) => kind.id === source) ? source : "memo",
      done: Boolean(note.done)
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
        shareFormat: shareFormatById(log?.shareFormat).id,
        bike: log?.bike && typeof log.bike === "object" ? log.bike : null
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
          title: "Schedule Binder MVP 만들기",
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
    gcalOnStateSaved();
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
      ${renderMobileNav()}
      ${renderSchedulePopup()}
      ${renderPlanCopyPicker()}
    `;
    bindEvents();
  }

  // 모바일(≤720px) 하단 탭바 — 데스크톱에서는 CSS로 숨긴다.
  let mobileMoreOpen = false;

  function renderMobileNav() {
    const mainItems = navItems.filter((item) => mobileNavIds.includes(item.id));
    const moreItems = navItems.filter((item) => !mobileNavIds.includes(item.id));
    const moreActive = moreItems.some((item) => item.id === state.activeView);
    return `
      <nav class="mobile-nav" aria-label="주요 화면 (모바일)">
        ${mobileMoreOpen ? `
          <div class="mobile-more-sheet">
            ${moreItems.map((item) => `
              <button class="mobile-more-btn ${state.activeView === item.id ? "is-active" : ""}" data-view="${item.id}">
                <span class="nav-icon" aria-hidden="true">${esc(item.icon)}</span>
                <span>${esc(item.label)}</span>
              </button>
            `).join("")}
          </div>
        ` : ""}
        <div class="mobile-nav-bar">
          ${mainItems.map((item) => `
            <button class="mobile-nav-btn ${state.activeView === item.id ? "is-active" : ""}" data-view="${item.id}">
              <span class="mobile-nav-icon" aria-hidden="true">${esc(item.icon)}</span>
              <span class="mobile-nav-label">${esc(item.label)}</span>
            </button>
          `).join("")}
          <button class="mobile-nav-btn ${moreActive || mobileMoreOpen ? "is-active" : ""}" data-mobile-more title="통계·가이드·설정">
            <span class="mobile-nav-icon" aria-hidden="true">⋯</span>
            <span class="mobile-nav-label">더보기</span>
          </button>
        </div>
      </nav>
    `;
  }

  function renderAuthScreen() {
    const isLoading = authStatus === "loading";
    return `
      <main class="auth-screen">
        <section class="auth-card">
          <div class="auth-brand">
            <div class="binder-mark" aria-hidden="true"></div>
            <div>
              <p class="brand-title">Schedule Binder</p>
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
        gcalInit();
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
        <div class="brand" aria-label="Schedule Binder">
          <div class="binder-mark" aria-hidden="true"></div>
          <div class="brand-copy">
            <p class="brand-title">Schedule Binder</p>
            <p class="brand-subtitle">연구·가족·자전거의 시간을 한 바인더에</p>
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
          ${gcalEnabled() ? `<span class="sync-chip gcal-chip" data-gcal-status title="Google 캘린더 동기화 상태">${esc(gcalChipLabel())}</span>` : ""}
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
    if (state.activeView === "inbox") {
      return "판단은 미루고 일단 적어두는 곳 — 비우는 정리는 주간 계획 때 합니다.";
    }
    if (state.activeView === "research") {
      return "마감과 '다음 행동'만 분명하면 연구는 굴러갑니다.";
    }
    if (state.activeView === "routine") {
      return "매주 반복하는 활동을 요일 표에 체크합니다.";
    }
    if (state.activeView === "stats") {
      return "계획과 실행 시간의 흐름을 확인합니다.";
    }
    if (state.activeView === "guide") {
      return "각 탭에 무엇을 쓰는지, 사용 예시를 한곳에서 봅니다.";
    }
    if (state.activeView === "settings") {
      return "Google 캘린더·스트라바 연동과 앱 환경을 관리합니다.";
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
      case "inbox":
        return renderInboxView();
      case "research":
        return renderResearchView();
      case "routine":
        return renderRoutineView();
      case "stats":
        return renderStatsView();
      case "guide":
        return renderGuideView();
      case "settings":
        return renderSettingsView();
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
          ${renderTodayBikePanel(date, log)}
          ${renderTodayMemoPanel(selectedBlock)}
          ${renderTodayJournalPanel(date, log)}
          ${renderTodaySharePanel(date, log)}
        </aside>
      </div>
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

  // ===== 오늘 탭: 자전거 카드 (가민 커넥트 → 스트라바 → 이 앱) =====

  function renderTodayBikePanel(date, log) {
    const connected = stravaConnected();
    const rides = connected ? bikeRidesForDate(date) : [];
    const manual = log.bike;
    return `
      <section class="panel bike-panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">🚴 자전거</h2>
            <p class="panel-subtitle">${connected
              ? `스트라바 연동 중${strava.lastSyncAt ? ` · 마지막 동기화 ${esc(stravaTimeLabel(strava.lastSyncAt))}` : ""}`
              : "가민으로 기록하고, 스트라바로 모으고, 여기서 하루와 함께 봅니다."}</p>
          </div>
          ${connected ? `<button type="button" class="icon-btn" data-strava-sync title="스트라바에서 새 라이딩 가져오기">↻</button>` : ""}
        </div>
        <div class="panel-body bike-body">
          ${rides.length ? rides.map(renderBikeRideCard).join("") : ""}
          ${!rides.length && manual ? `
            <div class="bike-ride-card is-manual">
              <div class="bike-ride-main">
                <strong>직접 기록한 라이딩</strong>
                <span>${esc(String(manual.km))}km · ${esc(String(manual.min))}분</span>
              </div>
              <button type="button" class="icon-btn" data-bike-manual-clear="${attr(date)}" title="기록 지우기">×</button>
            </div>
          ` : ""}
          ${!rides.length && !manual ? `
            <p class="bike-empty">${connected
              ? "이 날짜의 라이딩 기록이 없습니다. 라이딩 후 ↻를 눌러 가져오세요."
              : "아직 스트라바가 연결되지 않았습니다. 아래에 직접 적거나, 설정에서 연결하세요."}</p>
            <form class="bike-manual-form" data-form="bike-manual" data-bike-date="${attr(date)}">
              <input name="km" type="number" step="0.1" min="0" inputmode="decimal" placeholder="거리 km" required>
              <input name="min" type="number" step="1" min="0" inputmode="numeric" placeholder="시간 분" required>
              <button class="text-btn" type="submit">기록</button>
            </form>
          ` : ""}
          <div class="bike-links">
            <a class="text-btn tiny" href="https://connect.garmin.com/modern/" target="_blank" rel="noopener">가민 커넥트 열기</a>
            <a class="text-btn tiny" href="https://www.strava.com/dashboard" target="_blank" rel="noopener">스트라바 열기</a>
            ${connected ? "" : `<button type="button" class="text-btn tiny primary" data-view="settings">스트라바 연결하기</button>`}
          </div>
        </div>
      </section>
    `;
  }

  function renderBikeRideCard(ride) {
    return `
      <div class="bike-ride-card">
        <div class="bike-ride-main">
          <strong>${esc(ride.name)}</strong>
          <span>${ride.distanceKm.toFixed(1)}km · ${esc(minutesToText(ride.movingMin))} · ${ride.avgSpeedKmh.toFixed(1)}km/h${ride.elevM ? ` · ↑${Math.round(ride.elevM)}m` : ""}</span>
        </div>
        <a class="text-btn tiny" href="https://www.strava.com/activities/${attr(String(ride.id))}" target="_blank" rel="noopener" title="스트라바에서 상세 보기">보기</a>
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
    const linked = researchById(task.projectId) || researchById(task.goalId);
    const status = normalizeCheckStatus(task);
    const metaParts = [];
    if (!options.hidePeriod) {
      metaParts.push(task.weekStart ? `${task.weekStart} 주간` : (task.dueDate || "마감 없음"));
    }
    if (!options.hideMeta && linked) metaParts.push(linked.title);
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
              ${renderMonthSummaryLine("plan", widthPercent(item.planned), valueText(item.planned))}
              ${renderMonthSummaryLine("actual", widthPercent(item.actual), valueText(item.actual))}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderMonthSummaryLine(kind, percent, text) {
    return `
      <span class="month-summary-line is-${attr(kind)}">
        <svg class="month-summary-line-graph" aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none">
          <line x1="0" y1="0.5" x2="100" y2="0.5"></line>
          <line class="is-value" x1="0" y1="0.5" x2="${attr(percent)}" y2="0.5"></line>
        </svg>
        <b>${esc(text)}</b>
      </span>
    `;
  }

  function minutesToShortText(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return `${h}h${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  // ===== 수집함: 판단 없이 일단 적는 빠른 캡처 =====

  function inboxKindById(id) {
    return inboxKinds.find((kind) => kind.id === id) || inboxKinds[inboxKinds.length - 1];
  }

  function renderInboxView() {
    const open = state.notes.filter((note) => !note.done);
    const done = state.notes.filter((note) => note.done);
    return `
      <div class="view-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">수집함</h2>
              <p class="panel-subtitle">머릿속에 떠오른 것을 3초 안에 적어두는 곳입니다. 분류나 날짜는 나중에 정해도 됩니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <form class="inbox-capture" data-form="inbox">
              <input name="title" required placeholder="예: OO 논문 초록 확인 / 수아 분수 문제집 알아보기" autocomplete="off">
              <select name="source" title="종류">
                ${inboxKinds.map((kind) => `<option value="${attr(kind.id)}">${esc(kind.label)}</option>`).join("")}
              </select>
              <button class="text-btn primary" type="submit">담기</button>
            </form>
            <div class="list inbox-list">
              ${open.length ? open.map(renderInboxRow).join("") : `<div class="empty">수집함이 비어 있습니다. 떠오르면 바로 담아두세요.</div>`}
            </div>
            ${done.length ? `
              <details class="done-fold">
                <summary>처리한 항목 ${done.length}개</summary>
                <div class="list">${done.map(renderInboxRow).join("")}</div>
              </details>
            ` : ""}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">이 탭에 무엇을 쓰나요?</h2>
              <p class="panel-subtitle">쓸까 말까 고민되면 일단 담습니다. 주간 계획을 세울 때 한 번에 비우면 됩니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="tab-help-list">
              ${inboxKinds.map((kind) => `
                <div class="tab-help-row">
                  <span class="tag">${esc(kind.label)}</span>
                  <p>${esc(kind.hint)}</p>
                </div>
              `).join("")}
            </div>
            <p class="tab-help-footnote">항목 옆 <strong>연구로</strong> 버튼을 누르면 연구 탭의 관리 항목으로 승격됩니다. 끝난 항목은 ✓로 접어둡니다.</p>
          </div>
        </section>
      </div>
    `;
  }

  function renderInboxRow(note) {
    const kind = inboxKindById(note.source);
    return `
      <div class="list-row compact inbox-row ${note.done ? "is-done" : ""}">
        <button class="inbox-check ${note.done ? "is-checked" : ""}" data-inbox-done="${attr(note.id)}" title="${note.done ? "다시 열기" : "처리 완료"}">${note.done ? "✓" : ""}</button>
        <div>
          <p class="row-title">${esc(note.title)}</p>
          ${note.body ? `<p class="note-body">${esc(note.body)}</p>` : ""}
          <p class="row-meta">${esc(kind.label)}${note.createdAt ? ` · ${esc(String(note.createdAt).slice(0, 10))}` : ""}</p>
        </div>
        <div class="inbox-actions">
          ${note.done ? "" : `<button class="text-btn tiny" data-inbox-promote="${attr(note.id)}" title="연구 탭 항목으로 승격">연구로</button>`}
          <button class="icon-btn" data-delete-note="${attr(note.id)}" title="삭제">×</button>
        </div>
      </div>
    `;
  }

  // ===== 연구: 과제·실험·논문·발표를 마감과 다음 행동 중심으로 =====

  function researchById(id) {
    if (!id) return null;
    return state.research.find((item) => item.id === id) || null;
  }

  function researchKindById(id) {
    return researchKinds.find((kind) => kind.id === id) || researchKinds[researchKinds.length - 1];
  }

  function ddayLabel(dueDate) {
    if (!dueDate) return "";
    const diff = Math.round((parseISO(dueDate) - parseISO(todayISO())) / 86400000);
    if (diff > 0) return `D-${diff}`;
    if (diff === 0) return "D-day";
    return `+${Math.abs(diff)}일 지남`;
  }

  function ddayClass(dueDate) {
    if (!dueDate) return "";
    const diff = Math.round((parseISO(dueDate) - parseISO(todayISO())) / 86400000);
    if (diff < 0) return "is-overdue";
    if (diff <= 7) return "is-urgent";
    return "";
  }

  function renderResearchView() {
    const active = state.research
      .filter((item) => item.status !== "done")
      .slice()
      .sort((a, b) => (a.dueDate || "9999") < (b.dueDate || "9999") ? -1 : 1);
    const done = state.research.filter((item) => item.status === "done");
    return `
      <div class="view-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">진행 중인 연구 항목</h2>
              <p class="panel-subtitle">마감이 가까운 순서로 보입니다. 항목마다 '다음 행동' 한 줄만 살아 있으면 됩니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="list">
              ${active.length ? active.map(renderResearchBlock).join("") : `<div class="empty">아직 항목이 없습니다. 오른쪽에서 과제·실험·논문을 추가해 보세요.</div>`}
            </div>
            ${done.length ? `
              <details class="done-fold">
                <summary>완료한 항목 ${done.length}개</summary>
                <div class="list">${done.map(renderResearchBlock).join("")}</div>
              </details>
            ` : ""}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">연구 항목 추가</h2>
              <p class="panel-subtitle">돌아가는 일 단위로 추가합니다. 과제 보고서, 실험 세트, 논문 한 편, 학회 발표 하나.</p>
            </div>
          </div>
          <div class="panel-body">
            <form class="form-grid" data-form="research">
              <div class="field">
                <label for="research-title">제목</label>
                <input id="research-title" name="title" required placeholder="예: OO 과제 연차보고서 / 시료 2차 분석">
              </div>
              <div class="form-row">
                <div class="field">
                  <label for="research-kind">종류</label>
                  <select id="research-kind" name="kind">
                    ${researchKinds.map((kind) => `<option value="${attr(kind.id)}">${esc(kind.label)}</option>`).join("")}
                  </select>
                </div>
                <div class="field">
                  <label for="research-due">마감</label>
                  <input id="research-due" name="dueDate" type="date">
                </div>
              </div>
              <div class="field">
                <label for="research-next">다음 행동</label>
                <input id="research-next" name="nextAction" placeholder="지금 당장 할 수 있는 한 걸음 (예: 서론 문헌 3편 정리)">
              </div>
              <div class="field">
                <label for="research-description">메모</label>
                <textarea id="research-description" name="description" placeholder="완료 기준, 공동 연구자, 관련 링크 등"></textarea>
              </div>
              <button class="text-btn primary" type="submit">항목 추가</button>
            </form>
            <details class="settings-help tab-help-details">
              <summary>이 탭에 무엇을 쓰나요?</summary>
              <ul>
                <li><strong>과제·보고서</strong> — 연차/최종 보고서, 제안서, 과제 행정 마감</li>
                <li><strong>실험·분석</strong> — 실험 세트, 측정, 데이터 분석 단위</li>
                <li><strong>논문 작성</strong> — 작성 중인 원고 한 편이 한 항목</li>
                <li><strong>학회·발표</strong> — 초록 제출, 포스터·구두 발표 준비</li>
              </ul>
              <p>항목 아래 체크박스는 그 일의 세부 할 일입니다. 시간이 필요한 일은 주간 탭에서 Plan 블록으로 옮겨 실제 시간을 확보하세요.</p>
            </details>
          </div>
        </section>
      </div>
    `;
  }

  function renderResearchBlock(item) {
    const kind = researchKindById(item.kind);
    const tasks = state.tasks.filter((task) => task.projectId === item.id || task.goalId === item.id);
    const doneCount = tasks.filter((task) => task.done).length;
    const dday = ddayLabel(item.dueDate);
    const isDone = item.status === "done";
    return `
      <div class="project-block research-block ${isDone ? "is-done" : ""}" style="--kind-color:${attr(kind.color)}">
        <div class="list-row compact">
          <div>
            <div class="research-title-line">
              <span class="tag kind-tag">${esc(kind.label)}</span>
              <p class="row-title">${esc(item.title)}</p>
              ${dday && !isDone ? `<span class="dday-badge ${ddayClass(item.dueDate)}">${esc(dday)}</span>` : ""}
            </div>
            <p class="row-meta">${item.dueDate ? `마감 ${esc(item.dueDate)}` : "마감 없음"} · 할 일 ${doneCount}/${tasks.length}</p>
            ${item.description ? `<p class="note-body">${esc(item.description)}</p>` : ""}
          </div>
          <div class="inbox-actions">
            <button class="text-btn tiny" data-research-toggle="${attr(item.id)}">${isDone ? "다시 진행" : "완료"}</button>
            <button class="icon-btn" data-delete-research="${attr(item.id)}" title="항목 삭제">×</button>
          </div>
        </div>
        ${isDone ? "" : `
          <label class="next-action-line">
            <span>다음 행동</span>
            <input class="next-action-input" data-research-next="${attr(item.id)}" value="${attr(item.nextAction || "")}" placeholder="지금 할 수 있는 한 걸음을 적어두세요">
          </label>
          <div class="list" style="margin-top: 10px;">
            ${tasks.slice(0, 5).map((task) => renderTaskRow(task, { hidePeriod: true, hideMeta: true })).join("")}
          </div>
          <div style="margin-top: 10px;">
            ${renderTaskForm(item.dueDate || state.currentDate, item.id)}
          </div>
        `}
      </div>
    `;
  }

  // ===== 루틴: 매주 반복하는 활동의 요일 체크 =====

  function routineWeekDates(anchorDate) {
    const start = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, idx) => addDays(start, idx));
  }

  function isRoutineChecked(routineId, date) {
    return Array.isArray(state.routineChecks[date]) && state.routineChecks[date].includes(routineId);
  }

  function routineWeekCount(routineId, anchorDate) {
    return routineWeekDates(anchorDate).filter((date) => isRoutineChecked(routineId, date)).length;
  }

  function renderRoutineView() {
    const dates = routineWeekDates(state.currentDate);
    const today = todayISO();
    const dayNames = ["월", "화", "수", "목", "금", "토", "일"];
    return `
      <div class="view-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">이번 주 루틴</h2>
              <p class="panel-subtitle">한 일의 요일 칸을 눌러 체크합니다. 목표 횟수를 채우면 배지가 초록색이 됩니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="routine-table" role="table" aria-label="주간 루틴 체크표">
              <div class="routine-row routine-head" role="row">
                <span class="routine-name-cell" role="columnheader">루틴</span>
                ${dates.map((date, idx) => `
                  <span class="routine-day-head ${date === today ? "is-today" : ""}" role="columnheader">
                    <em>${esc(dayNames[idx])}</em>
                    <span>${esc(date.slice(8))}</span>
                  </span>
                `).join("")}
                <span class="routine-count-head" role="columnheader">달성</span>
              </div>
              ${state.routines.map((routine) => renderRoutineRow(routine, dates, today)).join("")}
            </div>
            ${state.routines.length ? "" : `<div class="empty">루틴이 없습니다. 아래에서 추가해 보세요.</div>`}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">루틴 추가</h2>
              <p class="panel-subtitle">'매주 n회'로 지키고 싶은 활동을 등록합니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <form class="form-grid" data-form="routine">
              <div class="form-row">
                <div class="field">
                  <label for="routine-name">이름</label>
                  <input id="routine-name" name="name" required placeholder="예: 아이 영어 읽기">
                </div>
                <div class="field routine-emoji-field">
                  <label for="routine-emoji">이모지</label>
                  <input id="routine-emoji" name="emoji" maxlength="4" placeholder="🚴">
                </div>
              </div>
              <div class="field">
                <label for="routine-target">주간 목표 횟수</label>
                <select id="routine-target" name="target">
                  ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === 3 ? "selected" : ""}>주 ${n}회</option>`).join("")}
                </select>
              </div>
              <button class="text-btn primary" type="submit">루틴 추가</button>
            </form>
            <details class="settings-help tab-help-details">
              <summary>이 탭에 무엇을 쓰나요?</summary>
              <ul>
                <li><strong>운동</strong> — 자전거 타기, 스트레칭, 근력. 자전거는 스트라바를 연결하면 라이딩한 날 자동으로 체크됩니다.</li>
                <li><strong>아이들과 공부</strong> — 함께 책 읽기, 수학 문제, 영어 등 '했다/안 했다'만 기록합니다.</li>
                <li><strong>연구 습관</strong> — 논문·자료 읽기처럼 매주 꾸준히 쌓여야 하는 일.</li>
              </ul>
              <p>완벽보다 꾸준함이 목적입니다. 주 목표를 낮게 잡고 채우는 재미를 유지하세요.</p>
            </details>
          </div>
        </section>
      </div>
    `;
  }

  function renderRoutineRow(routine, dates, today) {
    const count = routineWeekCount(routine.id, state.currentDate);
    const hit = count >= routine.target;
    return `
      <div class="routine-row" role="row">
        <span class="routine-name-cell" role="cell">
          <em>${esc(routine.emoji)}</em>
          <span class="routine-name-text">${esc(routine.name)}</span>
          <button class="icon-btn routine-delete" data-delete-routine="${attr(routine.id)}" title="루틴 삭제">×</button>
        </span>
        ${dates.map((date) => `
          <button class="routine-cell ${isRoutineChecked(routine.id, date) ? "is-checked" : ""} ${date === today ? "is-today" : ""}"
            data-routine-toggle="${attr(routine.id)}" data-routine-date="${attr(date)}" role="cell"
            title="${esc(routine.name)} · ${esc(date)}">${isRoutineChecked(routine.id, date) ? "✓" : ""}</button>
        `).join("")}
        <span class="routine-count ${hit ? "is-hit" : ""}" role="cell">${count}/${routine.target}</span>
      </div>
    `;
  }

  function renderStatsView() {
    const weekStart = startOfWeek(state.currentDate);
    const weekEnd = endOfWeek(state.currentDate);
    const weekBlocks = state.blocks.filter((block) => block.date >= weekStart && block.date <= weekEnd);
    const plannedWeekBlocks = weekBlocks.filter((block) => !block.actualOnly && !block.cancelled);
    const allStats = categoryStats(plannedWeekBlocks);
    const researchStats = researchTimeStats(plannedWeekBlocks);
    const weekDates = routineWeekDates(state.currentDate);
    const bikeKm = weekBikeKm(weekDates);
    return `
      <div class="full-grid">
        <div class="three-grid">
          <section class="panel">
            <div class="panel-header"><h2 class="panel-title">이번 주 계획 시간</h2></div>
            <div class="panel-body"><div class="mini-stat"><strong>${minutesToText(totalMinutes(plannedWeekBlocks))}</strong><span>${esc(formatDate(weekStart))}부터 ${esc(formatDate(weekEnd))}</span></div></div>
          </section>
          <section class="panel">
            <div class="panel-header"><h2 class="panel-title">이번 주 라이딩</h2></div>
            <div class="panel-body"><div class="mini-stat"><strong>${bikeKm > 0 ? `${bikeKm.toFixed(1)}km` : "0km"}</strong><span>${stravaConnected() ? "스트라바 기록 기준" : "수동 기록 기준"}</span></div></div>
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
                <h2 class="panel-title">연구별 투입 시간</h2>
                <p class="panel-subtitle">연구 항목과 연결된 계획 시간을 확인합니다.</p>
              </div>
            </div>
            <div class="panel-body">${renderGoalStats(researchStats)}</div>
          </section>
        </div>
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">루틴 달성</h2>
              <p class="panel-subtitle">이번 주 목표 대비 실제 체크 횟수입니다.</p>
            </div>
          </div>
          <div class="panel-body">
            ${state.routines.map((routine) => {
              const count = routineWeekCount(routine.id, state.currentDate);
              const pct = Math.min(100, Math.round((count / routine.target) * 100));
              return `
                <div class="stat-row">
                  <div class="stat-label">${esc(routine.emoji)} ${esc(routine.name)}</div>
                  <div class="stat-bar"><span style="width:${pct}%; background:${count >= routine.target ? "var(--green)" : "var(--blue)"}"></span></div>
                  <div class="stat-value">${count}/${routine.target}회</div>
                </div>
              `;
            }).join("") || `<div class="empty">등록된 루틴이 없습니다.</div>`}
          </div>
        </section>
      </div>
    `;
  }

  function renderGuideView() {
    return `
      <div class="full-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">탭별로 무엇을 쓰나요?</h2>
              <p class="panel-subtitle">하루의 흐름: 수집함에 던져두기 → 주간에 시간 배치 → 오늘에서 실행·기록 → 통계로 돌아보기.</p>
            </div>
          </div>
          <div class="panel-body">
            ${renderTabGuideTable()}
          </div>
        </section>
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
              ${renderGuideCard("4", "자전거 자동 기록", "가민 → 스트라바 → 오늘 탭", "설정에서 스트라바를 연결하면 가민으로 기록한 라이딩이 오늘 탭 자전거 카드와 루틴 체크, 주간 통계에 자동으로 나타납니다.")}
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

  function renderTabGuideTable() {
    const rows = [
      ["주간", "한 주의 시간 설계", "일요일 저녁이나 월요일 아침에 Plan 블록으로 연구·가족·운동 시간을 먼저 확보합니다. 하루가 끝나면 Do로 실제를 덮어써 계획과 비교합니다."],
      ["오늘", "오늘의 실행과 기록", "지금 하는 일에 집중하는 화면입니다. 일정 선택 → 실행 기록, 체크박스, 자전거 카드, 하루 회고까지 여기서 끝냅니다."],
      ["월간", "큰 흐름과 마감", "과제 보고서, 학회, 가족 행사 같은 굵직한 날짜를 봅니다. 세부 계획은 주간에서."],
      ["수집함", "3초 캡처", "실험 중 떠오른 아이디어, 읽어야 할 논문, 아이 공부 소재를 판단 없이 던져둡니다. 주간 계획 때 한 번에 비웁니다."],
      ["연구", "과제·실험·논문·발표", "돌아가는 연구 단위마다 마감(D-day)과 '다음 행동' 한 줄을 유지합니다. 시간이 필요하면 주간 탭에서 Plan 블록으로."],
      ["루틴", "매주 반복하는 활동", "자전거, 아이들과 공부, 논문 읽기처럼 '주 n회'가 목표인 활동을 요일 표에 체크합니다. 스트라바 연결 시 자전거는 자동 체크."],
      ["통계", "일주일 돌아보기", "시간이 계획대로 쓰였는지, 루틴을 지켰는지, 얼마나 달렸는지 확인하고 다음 주 계획에 반영합니다."]
    ];
    return `
      <div class="category-guide-table tab-guide-table" role="table" aria-label="탭 안내표">
        <div class="category-guide-row category-guide-head" role="row">
          <strong role="columnheader">탭</strong>
          <strong role="columnheader">한 줄 요약</strong>
          <strong role="columnheader">이렇게 씁니다</strong>
        </div>
        ${rows.map(([tab, summary, description]) => `
          <div class="category-guide-row tab-guide-row" role="row">
            <span role="cell">${esc(tab)}</span>
            <span role="cell" class="tab-guide-summary">${esc(summary)}</span>
            <p role="cell">${esc(description)}</p>
          </div>
        `).join("")}
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

  function renderPlanActualStats(stats) {
    const visible = stats.filter((item) => item.planned > 0 || item.actual > 0);
    const max = Math.max(...visible.flatMap((item) => [item.planned, item.actual]), 1);
    if (!visible.length) return `<div class="empty">아직 이번 주 시간 블록이 없습니다.</div>`;
    return `
      <div class="dual-stat-list">
        ${visible.map((item) => `
          <div class="dual-stat-row" style="--stat-color:${attr(item.color)}">
            <div class="dual-stat-label"><span class="status-dot" style="background:${attr(item.color)}"></span>${esc(item.name)}</div>
            <div class="dual-stat-lines">
              <div class="dual-stat-line">
                <span class="dual-stat-kind">계획</span>
                <div class="stat-bar"><span style="width:${Math.round((item.planned / max) * 100)}%; background:${attr(item.color)}"></span></div>
                <strong>${esc(minutesToShortText(item.planned))}</strong>
              </div>
              <div class="dual-stat-line is-actual">
                <span class="dual-stat-kind">수행</span>
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
    if (!visible.length) return `<div class="empty">연구 항목과 연결된 시간이 아직 없습니다.</div>`;
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
    bindGcalEvents();

    app.querySelectorAll(".block-memo, .daily-journal, .daily-review, .daily-share-draft").forEach(bindAutoGrowTextarea);

    app.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.view !== "month") monthEditorDate = null;
        mobileMoreOpen = false;
        setState((draft) => {
          draft.activeView = button.dataset.view;
        });
      });
    });

    const mobileMoreButton = app.querySelector("[data-mobile-more]");
    if (mobileMoreButton) {
      mobileMoreButton.addEventListener("click", () => {
        mobileMoreOpen = !mobileMoreOpen;
        render();
      });
    }

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
      ["delete-note", "notes"],
      ["delete-research", "research"],
      ["delete-routine", "routines"]
    ].forEach(([key, collection]) => {
      app.querySelectorAll(`[data-${key}]`).forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.dataset[toCamel(key)];
          setState((draft) => {
            draft[collection] = draft[collection].filter((item) => item.id !== id);
            if (collection === "research") {
              draft.tasks.forEach((item) => {
                if (item.projectId === id) item.projectId = "";
                if (item.goalId === id) item.goalId = "";
              });
              draft.blocks.forEach((item) => {
                if (item.projectId === id) item.projectId = "";
                if (item.goalId === id) item.goalId = "";
              });
            }
            if (collection === "routines") {
              Object.keys(draft.routineChecks).forEach((date) => {
                draft.routineChecks[date] = (draft.routineChecks[date] || []).filter((rid) => rid !== id);
              });
            }
          });
        });
      });
    });

    // 수집함: 처리 토글 + 연구로 승격
    app.querySelectorAll("[data-inbox-done]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          const note = draft.notes.find((item) => item.id === button.dataset.inboxDone);
          if (note) note.done = !note.done;
        });
      });
    });

    app.querySelectorAll("[data-inbox-promote]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          const note = draft.notes.find((item) => item.id === button.dataset.inboxPromote);
          if (!note) return;
          draft.research.push(normalizeResearchItem({
            title: note.title,
            kind: note.source === "paper" ? "paper" : "etc",
            description: note.body || "",
            nextAction: ""
          }));
          note.done = true;
          draft.activeView = "research";
        });
      });
    });

    // 연구: 완료 토글 + 다음 행동 입력
    app.querySelectorAll("[data-research-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          const item = draft.research.find((entry) => entry.id === button.dataset.researchToggle);
          if (item) item.status = item.status === "done" ? "active" : "done";
        });
      });
    });

    app.querySelectorAll("[data-research-next]").forEach((input) => {
      input.addEventListener("change", () => {
        setState((draft) => {
          const item = draft.research.find((entry) => entry.id === input.dataset.researchNext);
          if (item) item.nextAction = input.value.trim();
        });
      });
    });

    // 루틴: 요일 칸 토글
    app.querySelectorAll("[data-routine-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const routineId = button.dataset.routineToggle;
        const date = button.dataset.routineDate;
        setState((draft) => {
          const list = Array.isArray(draft.routineChecks[date]) ? draft.routineChecks[date] : [];
          draft.routineChecks[date] = list.includes(routineId)
            ? list.filter((id) => id !== routineId)
            : [...list, routineId];
        });
      });
    });

    bindStravaEvents();
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

    if (type === "bike-manual") {
      const bikeDate = form.dataset.bikeDate || state.currentDate;
      setState((draft) => {
        const log = ensureDailyLogMutable(draft, bikeDate);
        log.bike = { km: Number(data.km) || 0, min: Number(data.min) || 0 };
        const bikeRoutine = draft.routines.find((routine) => routine.id === "routine-bike" || routine.name.includes("자전거"));
        if (bikeRoutine) {
          const list = Array.isArray(draft.routineChecks[bikeDate]) ? draft.routineChecks[bikeDate] : [];
          if (!list.includes(bikeRoutine.id)) draft.routineChecks[bikeDate] = [...list, bikeRoutine.id];
        }
      });
      return;
    }

    if (type === "task") {
      setState((draft) => {
        draft.tasks.push({
          id: uid("task"),
          title: data.title.trim(),
          projectId: data.projectId || "",
          goalId: "",
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

    if (type === "research") {
      setState((draft) => {
        draft.research.push(normalizeResearchItem({
          title: data.title.trim(),
          kind: data.kind,
          dueDate: data.dueDate || "",
          nextAction: (data.nextAction || "").trim(),
          description: (data.description || "").trim()
        }));
      });
      return;
    }

    if (type === "inbox") {
      setState((draft) => {
        draft.notes.unshift({
          id: uid("note"),
          title: data.title.trim(),
          source: data.source || "memo",
          tags: [],
          body: "",
          done: false,
          createdAt: new Date().toISOString()
        });
      });
      return;
    }

    if (type === "routine") {
      setState((draft) => {
        draft.routines.push({
          id: uid("routine"),
          name: data.name.trim(),
          emoji: (data.emoji || "").trim() || "✓",
          target: Math.min(7, Math.max(1, Number(data.target) || 3))
        });
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

  function researchTimeStats(blocks) {
    const base = state.research
      .filter((item) => item.status !== "done")
      .map((item) => ({
        id: item.id,
        name: item.title,
        color: researchKindById(item.kind).color,
        minutes: 0
      }));
    const unlinked = { id: "", name: "연구 미연결", color: "#667085", minutes: 0 };
    blocks.forEach((block) => {
      const minutes = Math.max(0, minutesFromTime(block.end) - minutesFromTime(block.start));
      const target = base.find((item) => item.id === block.goalId || item.id === block.projectId) || unlinked;
      target.minutes += minutes;
    });
    return [...base, unlinked];
  }

  // ===== 스트라바 연동 (자전거) =====
  // 흐름: 가민 기기로 라이딩 기록 → 가민 커넥트가 스트라바로 자동 업로드(가민 앱에서 1회 설정)
  //       → 이 앱이 스트라바 API로 라이딩을 읽어 오늘 탭·통계·루틴에 반영한다.
  // 가민 공식 API는 기업 승인제라 개인 앱에서 쓸 수 없어 스트라바를 허브로 사용한다.
  // GCal과 동일하게 본인 소유 API 앱(Client ID/Secret)을 설정 탭에 입력하는 개인용 구조.

  const STRAVA_LOCAL_KEY = "life-binder-strava-v1";
  const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
  const STRAVA_API = "https://www.strava.com/api/v3";
  const STRAVA_RIDE_TYPES = ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide", "EMountainBikeRide", "Velomobile", "Handcycle"];
  const STRAVA_SYNC_DAYS = 60;
  const STRAVA_AUTO_SYNC_MINUTES = 30;

  let strava = loadStravaLocal();
  let stravaStatusText = "";
  let stravaSyncing = false;

  function loadStravaLocal() {
    try {
      const raw = window.localStorage.getItem(STRAVA_LOCAL_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        clientId: parsed.clientId || "",
        clientSecret: parsed.clientSecret || "",
        accessToken: parsed.accessToken || "",
        refreshToken: parsed.refreshToken || "",
        expiresAt: Number(parsed.expiresAt) || 0,
        athleteName: parsed.athleteName || "",
        lastSyncAt: parsed.lastSyncAt || "",
        activities: Array.isArray(parsed.activities) ? parsed.activities : []
      };
    } catch (error) {
      return { clientId: "", clientSecret: "", accessToken: "", refreshToken: "", expiresAt: 0, athleteName: "", lastSyncAt: "", activities: [] };
    }
  }

  function saveStravaLocal() {
    try {
      window.localStorage.setItem(STRAVA_LOCAL_KEY, JSON.stringify(strava));
    } catch (error) {
      console.warn("Strava local save failed.", error);
    }
  }

  function stravaConnected() {
    return Boolean(strava.refreshToken);
  }

  function stravaTimeLabel(iso) {
    if (!iso) return "-";
    try {
      return new Intl.DateTimeFormat("ko", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(iso));
    } catch (error) {
      return iso;
    }
  }

  function stravaRedirectUri() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function stravaConnect() {
    if (!strava.clientId || !strava.clientSecret) {
      stravaStatusText = "Client ID와 Secret을 먼저 저장해 주세요.";
      render();
      return;
    }
    const params = new URLSearchParams({
      client_id: strava.clientId,
      redirect_uri: stravaRedirectUri(),
      response_type: "code",
      approval_prompt: "auto",
      scope: "read,activity:read_all",
      state: "sb-strava"
    });
    window.location.href = `https://www.strava.com/oauth/authorize?${params.toString()}`;
  }

  function stravaDisconnect() {
    strava.accessToken = "";
    strava.refreshToken = "";
    strava.expiresAt = 0;
    strava.athleteName = "";
    stravaStatusText = "연결을 해제했습니다.";
    saveStravaLocal();
    render();
  }

  // 스트라바 인증 후 ?code=...&state=sb-strava 로 돌아온 경우 토큰으로 교환한다.
  async function stravaHandleRedirect() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("state") !== "sb-strava") return;
    const code = params.get("code");
    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState(null, "", cleanUrl);
    if (!code) {
      stravaStatusText = "스트라바 연결이 취소되었습니다.";
      return;
    }
    try {
      const body = new URLSearchParams({
        client_id: strava.clientId,
        client_secret: strava.clientSecret,
        code,
        grant_type: "authorization_code"
      });
      const response = await fetch(STRAVA_TOKEN_URL, { method: "POST", body });
      if (!response.ok) throw new Error(`token exchange ${response.status}`);
      const data = await response.json();
      strava.accessToken = data.access_token || "";
      strava.refreshToken = data.refresh_token || "";
      strava.expiresAt = Number(data.expires_at) || 0;
      strava.athleteName = [data.athlete?.firstname, data.athlete?.lastname].filter(Boolean).join(" ");
      stravaStatusText = "스트라바가 연결되었습니다.";
      saveStravaLocal();
      await stravaSyncNow(true);
    } catch (error) {
      console.error("Strava token exchange failed.", error);
      stravaStatusText = "연결 실패 — Client ID/Secret과 콜백 도메인을 확인해 주세요.";
    }
  }

  async function stravaEnsureToken() {
    const now = Math.floor(Date.now() / 1000);
    if (strava.accessToken && strava.expiresAt - 120 > now) return;
    const body = new URLSearchParams({
      client_id: strava.clientId,
      client_secret: strava.clientSecret,
      refresh_token: strava.refreshToken,
      grant_type: "refresh_token"
    });
    const response = await fetch(STRAVA_TOKEN_URL, { method: "POST", body });
    if (!response.ok) throw new Error(`token refresh ${response.status}`);
    const data = await response.json();
    strava.accessToken = data.access_token || "";
    strava.refreshToken = data.refresh_token || strava.refreshToken;
    strava.expiresAt = Number(data.expires_at) || 0;
    saveStravaLocal();
  }

  async function stravaSyncNow(rerender) {
    if (!stravaConnected() || stravaSyncing) return;
    stravaSyncing = true;
    stravaStatusText = "동기화 중...";
    try {
      await stravaEnsureToken();
      const after = Math.floor(Date.now() / 1000) - STRAVA_SYNC_DAYS * 86400;
      const response = await fetch(`${STRAVA_API}/athlete/activities?after=${after}&per_page=100`, {
        headers: { Authorization: `Bearer ${strava.accessToken}` }
      });
      if (!response.ok) throw new Error(`activities ${response.status}`);
      const list = await response.json();
      strava.activities = (Array.isArray(list) ? list : [])
        .filter((activity) => STRAVA_RIDE_TYPES.includes(activity.sport_type || activity.type))
        .map((activity) => ({
          id: activity.id,
          name: activity.name || "라이딩",
          date: String(activity.start_date_local || "").slice(0, 10),
          distanceKm: (Number(activity.distance) || 0) / 1000,
          movingMin: Math.round((Number(activity.moving_time) || 0) / 60),
          elevM: Number(activity.total_elevation_gain) || 0,
          avgSpeedKmh: (Number(activity.average_speed) || 0) * 3.6
        }));
      strava.lastSyncAt = new Date().toISOString();
      stravaStatusText = `동기화 완료 — 최근 ${STRAVA_SYNC_DAYS}일 라이딩 ${strava.activities.length}건`;
      saveStravaLocal();
      autoCheckBikeRoutine();
    } catch (error) {
      console.error("Strava sync failed.", error);
      stravaStatusText = "동기화 실패 — 잠시 후 다시 시도해 주세요.";
    } finally {
      stravaSyncing = false;
      if (rerender) render();
    }
  }

  // 라이딩한 날은 '자전거' 루틴을 자동 체크한다 (체크 해제는 하지 않음).
  function autoCheckBikeRoutine() {
    const bikeRoutine = state.routines.find((routine) => routine.id === "routine-bike" || routine.name.includes("자전거"));
    if (!bikeRoutine) return;
    const rideDates = new Set(strava.activities.map((ride) => ride.date));
    let changed = false;
    rideDates.forEach((date) => {
      const list = Array.isArray(state.routineChecks[date]) ? state.routineChecks[date] : [];
      if (!list.includes(bikeRoutine.id)) changed = true;
    });
    if (!changed) return;
    setState((draft) => {
      rideDates.forEach((date) => {
        const list = Array.isArray(draft.routineChecks[date]) ? draft.routineChecks[date] : [];
        if (!list.includes(bikeRoutine.id)) draft.routineChecks[date] = [...list, bikeRoutine.id];
      });
    });
  }

  function bikeRidesForDate(date) {
    return strava.activities.filter((ride) => ride.date === date);
  }

  // 주간 라이딩 거리: 스트라바 기록이 있는 날은 스트라바, 없는 날은 수동 기록을 합산한다.
  function weekBikeKm(dates) {
    let total = 0;
    dates.forEach((date) => {
      const rides = stravaConnected() ? bikeRidesForDate(date) : [];
      if (rides.length) {
        total += rides.reduce((sum, ride) => sum + ride.distanceKm, 0);
        return;
      }
      const manual = state.reviews.daily[date]?.bike;
      if (manual) total += Number(manual.km) || 0;
    });
    return total;
  }

  function stravaInit() {
    stravaHandleRedirect().then(() => {
      if (!stravaConnected()) return;
      const last = strava.lastSyncAt ? Date.parse(strava.lastSyncAt) : 0;
      if (Date.now() - last > STRAVA_AUTO_SYNC_MINUTES * 60 * 1000) {
        stravaSyncNow(true);
      }
    });
  }

  function bindStravaEvents() {
    const saveButton = app.querySelector("[data-strava-save-keys]");
    if (saveButton) {
      saveButton.addEventListener("click", () => {
        strava.clientId = String(app.querySelector("[data-strava-client-id]")?.value || "").trim();
        strava.clientSecret = String(app.querySelector("[data-strava-client-secret]")?.value || "").trim();
        stravaStatusText = "저장했습니다. 이제 '스트라바 계정 연결'을 누르세요.";
        saveStravaLocal();
        render();
      });
    }
    const connectButton = app.querySelector("[data-strava-connect]");
    if (connectButton) connectButton.addEventListener("click", stravaConnect);
    const disconnectButton = app.querySelector("[data-strava-disconnect]");
    if (disconnectButton) disconnectButton.addEventListener("click", stravaDisconnect);
    app.querySelectorAll("[data-strava-sync]").forEach((button) => {
      button.addEventListener("click", () => stravaSyncNow(true));
    });
    app.querySelectorAll("[data-bike-manual-clear]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          const log = ensureDailyLogMutable(draft, button.dataset.bikeManualClear);
          log.bike = null;
        });
      });
    });
  }

  // ===== Google Calendar 양방향 동기화 (Plan 전용) =====
  // 사양: GCAL_INTEGRATION_REQUEST.md — Plan만 / 양방향 / 전용 "Schedule Binder" 캘린더 / GIS OAuth / 폴링
  // 주의: localStorage 키(life-binder-*)와 lifeBinderId extendedProperty는 기존 데이터·매핑 호환을 위해 유지한다.

  const GCAL_LOCAL_KEY = "life-binder-gcal-v1";
  const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar";
  const GCAL_API = "https://www.googleapis.com/calendar/v3";
  const GCAL_CALENDAR_NAME = "Schedule Binder";
  const GCAL_CALENDAR_LEGACY_NAME = "Life Binder"; // 구 이름 — 발견 시 자동 개명
  const GCAL_PUSH_DELAY = 1200;
  const GCAL_FAILURE_ALERT_AT = 3;
  const GCAL_COLOR_BY_CATEGORY = { mainWork: "5", supportWork: "4", faithHome: "10", selfDev: "9", network: "6" };
  const GCAL_CATEGORY_BY_COLOR = { 5: "mainWork", 4: "supportWork", 10: "faithHome", 9: "selfDev", 6: "network" };

  let gcal = loadGcalLocal();
  let gcalTokenClient = null;
  let gcalGisPromise = null;
  let gcalPushTimer = null;
  let gcalPollTimer = null;
  let gcalBusy = false;
  let gcalInitialized = false;
  let gcalApplyingRemote = false;
  let gcalFailureCount = 0;
  let gcalFailureAlerted = false;
  let gcalStatusText = "";
  const gcalLastFingerprints = new Map();

  function loadGcalLocal() {
    const defaults = {
      clientId: "",
      token: "",
      tokenExpiresAt: 0,
      calendarId: "",
      email: "",
      syncToken: "",
      pollMinutes: 5,
      lastPushAt: "",
      lastPullAt: ""
    };
    try {
      const raw = window.localStorage.getItem(GCAL_LOCAL_KEY);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch (error) {
      return defaults;
    }
  }

  function saveGcalLocal() {
    try {
      window.localStorage.setItem(GCAL_LOCAL_KEY, JSON.stringify(gcal));
    } catch (error) {
      console.warn("GCal settings save failed.", error);
    }
  }

  function gcalEnabled() {
    return Boolean(gcal.clientId);
  }

  function gcalConnected() {
    return Boolean(gcal.token);
  }

  function gcalTimeLabel(iso) {
    if (!iso) return "-";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "-";
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function gcalChipLabel() {
    if (gcalStatusText) return gcalStatusText;
    if (!gcalConnected()) return "GCal 미연결";
    return gcal.lastPullAt ? `GCal ${gcalTimeLabel(gcal.lastPullAt)}` : "GCal 연결됨";
  }

  function setGcalStatus(text) {
    gcalStatusText = text;
    const chip = app.querySelector("[data-gcal-status]");
    if (chip) chip.textContent = gcalChipLabel();
    const detail = app.querySelector("[data-gcal-settings-status]");
    if (detail) detail.textContent = text || (gcalConnected() ? "정상" : "미연결");
  }

  function gcalRefreshSettingsTimes() {
    const push = app.querySelector("[data-gcal-last-push]");
    if (push) push.textContent = gcalTimeLabel(gcal.lastPushAt);
    const pull = app.querySelector("[data-gcal-last-pull]");
    if (pull) pull.textContent = gcalTimeLabel(gcal.lastPullAt);
    const chip = app.querySelector("[data-gcal-status]");
    if (chip) chip.textContent = gcalChipLabel();
  }

  function loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gcalGisPromise) return gcalGisPromise;
    gcalGisPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gcalGisPromise = null;
        reject(new Error("Google 스크립트를 불러오지 못했습니다."));
      };
      document.head.appendChild(script);
    });
    return gcalGisPromise;
  }

  async function gcalRequestToken(interactive) {
    await loadGis();
    return new Promise((resolve, reject) => {
      if (!gcalTokenClient || gcalTokenClient._clientId !== gcal.clientId) {
        gcalTokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: gcal.clientId,
          scope: GCAL_SCOPE,
          callback: () => {}
        });
        gcalTokenClient._clientId = gcal.clientId;
      }
      gcalTokenClient.callback = (response) => {
        if (response.error) {
          reject(new Error(`oauth:${response.error}`));
          return;
        }
        gcal.token = response.access_token;
        gcal.tokenExpiresAt = Date.now() + Math.max(60, Number(response.expires_in || 3600) - 60) * 1000;
        saveGcalLocal();
        resolve(gcal.token);
      };
      gcalTokenClient.error_callback = (error) => {
        reject(new Error(`oauth:${error?.type || "popup"}`));
      };
      gcalTokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
    });
  }

  async function gcalEnsureToken() {
    if (gcal.token && Date.now() < gcal.tokenExpiresAt) return gcal.token;
    return gcalRequestToken(false);
  }

  async function gcalApi(path, options = {}) {
    const request = async (token) => fetch(`${GCAL_API}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let response = await request(await gcalEnsureToken());
    if (response.status === 401) {
      gcal.token = "";
      gcal.tokenExpiresAt = 0;
      saveGcalLocal();
      response = await request(await gcalEnsureToken());
    }
    return response;
  }

  async function gcalRenameCalendar(calendarId) {
    try {
      await gcalApi(`/calendars/${encodeURIComponent(calendarId)}`, { method: "PATCH", body: { summary: GCAL_CALENDAR_NAME } });
    } catch (error) {
      console.warn("GCal calendar rename failed.", error);
    }
  }

  async function gcalEnsureCalendar() {
    if (gcal.calendarId) {
      const check = await gcalApi(`/calendars/${encodeURIComponent(gcal.calendarId)}`);
      if (check.ok) {
        const info = await check.json();
        if (info.summary && info.summary !== GCAL_CALENDAR_NAME) await gcalRenameCalendar(gcal.calendarId);
        return gcal.calendarId;
      }
      if (check.status !== 404 && check.status !== 410) throw new Error(`calendar check ${check.status}`);
      gcal.calendarId = "";
      gcal.syncToken = "";
      saveGcalLocal();
    }
    let pageToken = "";
    let legacyFound = null;
    do {
      const res = await gcalApi(`/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      if (!res.ok) throw new Error(`calendarList ${res.status}`);
      const data = await res.json();
      const found = (data.items || []).find((item) => item.summary === GCAL_CALENDAR_NAME);
      if (found) {
        gcal.calendarId = found.id;
        saveGcalLocal();
        return gcal.calendarId;
      }
      if (!legacyFound) legacyFound = (data.items || []).find((item) => item.summary === GCAL_CALENDAR_LEGACY_NAME);
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    if (legacyFound) {
      gcal.calendarId = legacyFound.id;
      gcal.syncToken = "";
      saveGcalLocal();
      await gcalRenameCalendar(legacyFound.id);
      return gcal.calendarId;
    }
    const created = await gcalApi("/calendars", { method: "POST", body: { summary: GCAL_CALENDAR_NAME, timeZone: "Asia/Seoul" } });
    if (!created.ok) throw new Error(`calendar create ${created.status}`);
    const data = await created.json();
    gcal.calendarId = data.id;
    gcal.syncToken = "";
    saveGcalLocal();
    return gcal.calendarId;
  }

  function gcalSyncMap() {
    if (!state.gcalSync || typeof state.gcalSync !== "object") state.gcalSync = {};
    return state.gcalSync;
  }

  function gcalBlockSyncable(block) {
    return Boolean(block && !block.actualOnly && !block.cancelled && isValidISODate(block.date || "") && block.start && block.end);
  }

  function gcalFingerprint(block) {
    return [block.title || "", block.date, block.start, block.end, block.categoryId, block.memoText || ""].join("|");
  }

  function gcalDateTime(date, time) {
    if (time === "24:00") return `${addDays(date, 1)}T00:00:00`;
    return `${date}T${time}:00`;
  }

  function gcalEventBody(block) {
    return {
      summary: block.title || "(제목 없음)",
      description: block.memoText || "",
      colorId: GCAL_COLOR_BY_CATEGORY[block.categoryId] || "5",
      start: { dateTime: gcalDateTime(block.date, block.start), timeZone: "Asia/Seoul" },
      end: { dateTime: gcalDateTime(block.date, block.end), timeZone: "Asia/Seoul" },
      extendedProperties: { private: { lifeBinderId: block.id } }
    };
  }

  function gcalSeoulParts(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const text = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
    return { date: text.slice(0, 10), time: text.slice(11, 16) };
  }

  function gcalParseEventTimes(event) {
    const startRaw = event.start?.dateTime || "";
    const endRaw = event.end?.dateTime || "";
    if (!startRaw || !endRaw) return null;
    const startParts = gcalSeoulParts(startRaw);
    const endParts = gcalSeoulParts(endRaw);
    if (!startParts || !endParts) return null;
    const date = startParts.date;
    let startMinutes = clampDayMinutes(minutesFromTime(startParts.time));
    let endMinutes;
    if (endParts.date !== date) {
      endMinutes = DAY_END_HOUR * 60;
    } else {
      endMinutes = clampDayMinutes(minutesFromTime(endParts.time));
    }
    if (endMinutes <= startMinutes) {
      endMinutes = Math.min(startMinutes + SNAP_MINUTES, DAY_END_HOUR * 60);
      if (endMinutes <= startMinutes) startMinutes = endMinutes - SNAP_MINUTES;
    }
    return { date, start: timeFromMinutes(startMinutes), end: timeFromMinutes(endMinutes) };
  }

  function gcalRefreshFingerprintCache() {
    state.blocks.forEach((block) => {
      if (gcalBlockSyncable(block)) gcalLastFingerprints.set(block.id, gcalFingerprint(block));
    });
  }

  function gcalStampLocalEdits() {
    const map = gcalSyncMap();
    const now = new Date().toISOString();
    state.blocks.forEach((block) => {
      if (!gcalBlockSyncable(block)) return;
      const fingerprint = gcalFingerprint(block);
      const last = gcalLastFingerprints.get(block.id);
      if (last !== undefined && last !== fingerprint) {
        block.planUpdatedAt = now;
      } else if (last === undefined && !map[block.id] && !block.planUpdatedAt) {
        block.planUpdatedAt = now;
      }
      gcalLastFingerprints.set(block.id, fingerprint);
    });
  }

  function gcalOnStateSaved() {
    if (!gcalEnabled()) return;
    if (gcalApplyingRemote) {
      gcalRefreshFingerprintCache();
      return;
    }
    gcalStampLocalEdits();
    if (gcalConnected()) gcalQueuePush();
  }

  function gcalQueuePush() {
    if (!gcalEnabled() || !gcalConnected()) return;
    if (gcalPushTimer) window.clearTimeout(gcalPushTimer);
    gcalPushTimer = window.setTimeout(() => {
      gcalPushTimer = null;
      gcalPushAll().catch((error) => gcalHandleFailure(error, "push"));
    }, GCAL_PUSH_DELAY);
  }

  async function gcalPushAll() {
    if (!gcalEnabled() || !gcalConnected()) return;
    if (gcalBusy) {
      gcalQueuePush();
      return;
    }
    gcalBusy = true;
    setGcalStatus("GCal 보내는 중...");
    try {
      await gcalEnsureCalendar();
      const map = gcalSyncMap();
      const calendarPath = encodeURIComponent(gcal.calendarId);
      const syncableIds = new Set();
      let changed = false;
      for (const block of state.blocks) {
        if (!gcalBlockSyncable(block)) continue;
        syncableIds.add(block.id);
        const entry = map[block.id];
        const fingerprint = gcalFingerprint(block);
        if (!entry) {
          const res = await gcalApi(`/calendars/${calendarPath}/events`, { method: "POST", body: gcalEventBody(block) });
          if (!res.ok) throw new Error(`event insert ${res.status}`);
          const data = await res.json();
          map[block.id] = { eventId: data.id, etag: data.etag || "", updated: data.updated || "", fingerprint };
          changed = true;
        } else if (entry.fingerprint !== fingerprint) {
          const res = await gcalApi(`/calendars/${calendarPath}/events/${encodeURIComponent(entry.eventId)}`, { method: "PATCH", body: gcalEventBody(block) });
          if (res.status === 404 || res.status === 410) {
            delete map[block.id];
            changed = true;
            gcalQueuePush();
            continue;
          }
          if (!res.ok) throw new Error(`event patch ${res.status}`);
          const data = await res.json();
          map[block.id] = { eventId: data.id, etag: data.etag || "", updated: data.updated || "", fingerprint };
          changed = true;
        }
      }
      for (const blockId of Object.keys(map)) {
        if (syncableIds.has(blockId)) continue;
        const entry = map[blockId];
        if (entry?.eventId) {
          const res = await gcalApi(`/calendars/${calendarPath}/events/${encodeURIComponent(entry.eventId)}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`event delete ${res.status}`);
        }
        delete map[blockId];
        gcalLastFingerprints.delete(blockId);
        changed = true;
      }
      gcal.lastPushAt = new Date().toISOString();
      saveGcalLocal();
      if (changed) {
        saveLocalState();
        queueRemoteSave();
      }
      gcalFailureCount = 0;
      gcalFailureAlerted = false;
      setGcalStatus("");
      gcalRefreshSettingsTimes();
    } finally {
      gcalBusy = false;
    }
  }

  async function gcalPullNow(manual = false) {
    if (!gcalEnabled() || !gcalConnected()) return;
    if (gcalBusy) return;
    gcalBusy = true;
    setGcalStatus(manual ? "GCal 가져오는 중..." : "GCal 확인 중...");
    try {
      await gcalEnsureCalendar();
      const calendarPath = encodeURIComponent(gcal.calendarId);
      let events = [];
      let pageToken = "";
      let nextSyncToken = "";
      let useToken = gcal.syncToken;
      for (;;) {
        const params = new URLSearchParams({ maxResults: "250", showDeleted: "true" });
        if (useToken) params.set("syncToken", useToken);
        if (pageToken) params.set("pageToken", pageToken);
        const res = await gcalApi(`/calendars/${calendarPath}/events?${params.toString()}`);
        if (res.status === 410) {
          useToken = "";
          gcal.syncToken = "";
          pageToken = "";
          events = [];
          continue;
        }
        if (!res.ok) throw new Error(`events list ${res.status}`);
        const data = await res.json();
        events = events.concat(data.items || []);
        if (data.nextPageToken) {
          pageToken = data.nextPageToken;
          continue;
        }
        nextSyncToken = data.nextSyncToken || "";
        break;
      }
      gcalApplyRemoteEvents(events);
      if (nextSyncToken) gcal.syncToken = nextSyncToken;
      gcal.lastPullAt = new Date().toISOString();
      saveGcalLocal();
      gcalFailureCount = 0;
      gcalFailureAlerted = false;
      setGcalStatus("");
      gcalRefreshSettingsTimes();
    } finally {
      gcalBusy = false;
    }
    gcalQueuePush();
  }

  function gcalApplyRemoteEvents(events) {
    if (!events.length) return;
    const map = gcalSyncMap();
    const eventIdToBlockId = {};
    Object.entries(map).forEach(([blockId, entry]) => {
      if (entry?.eventId) eventIdToBlockId[entry.eventId] = blockId;
    });
    const writebacks = [];
    gcalApplyingRemote = true;
    try {
      setState((draft) => {
        events.forEach((event) => {
          if (!event || event.recurringEventId || event.recurrence) return;
          const linkedId = event.extendedProperties?.private?.lifeBinderId || eventIdToBlockId[event.id] || "";
          if (event.status === "cancelled") {
            if (linkedId) {
              const idx = draft.blocks.findIndex((item) => item.id === linkedId);
              if (idx >= 0) draft.blocks.splice(idx, 1);
              delete map[linkedId];
              gcalLastFingerprints.delete(linkedId);
            }
            return;
          }
          const times = gcalParseEventTimes(event);
          if (!times) return;
          if (linkedId) {
            const block = draft.blocks.find((item) => item.id === linkedId);
            if (!block) return;
            const entry = map[linkedId] || { eventId: event.id, etag: "", updated: "", fingerprint: "" };
            const remoteChanged = !entry.updated || (event.updated || "") > entry.updated;
            const localChanged = gcalFingerprint(block) !== entry.fingerprint;
            let applyRemote = remoteChanged;
            if (remoteChanged && localChanged) {
              applyRemote = (event.updated || "") > (block.planUpdatedAt || "");
            }
            if (applyRemote && remoteChanged) {
              block.title = event.summary || block.title || "(제목 없음)";
              block.memoText = event.description || "";
              block.date = times.date;
              block.start = times.start;
              block.end = times.end;
              const colorCategory = GCAL_CATEGORY_BY_COLOR[event.colorId || ""] || "";
              if (colorCategory) {
                block.categoryId = colorCategory;
                if (!blockHasActualLine(block)) block.actualCategoryId = colorCategory;
              }
              block.planUpdatedAt = event.updated || new Date().toISOString();
              map[linkedId] = { eventId: event.id, etag: event.etag || "", updated: event.updated || "", fingerprint: gcalFingerprint(block) };
              gcalLastFingerprints.set(linkedId, map[linkedId].fingerprint);
            } else {
              map[linkedId] = { ...entry, eventId: event.id, updated: event.updated || entry.updated };
            }
            return;
          }
          const colorCategory = GCAL_CATEGORY_BY_COLOR[event.colorId || ""] || "mainWork";
          const id = uid("block");
          draft.blocks.push({
            id,
            title: event.summary || "(제목 없음)",
            date: times.date,
            start: times.start,
            end: times.end,
            categoryId: colorCategory,
            actualCategoryId: colorCategory,
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
            memoText: event.description || "",
            photos: [],
            planUpdatedAt: event.updated || new Date().toISOString()
          });
          map[id] = { eventId: event.id, etag: event.etag || "", updated: event.updated || "", fingerprint: "" };
          writebacks.push({ eventId: event.id, blockId: id });
        });
      });
    } finally {
      gcalApplyingRemote = false;
    }
    const finalMap = gcalSyncMap();
    writebacks.forEach((item) => {
      const block = state.blocks.find((candidate) => candidate.id === item.blockId);
      if (block && finalMap[item.blockId]) {
        finalMap[item.blockId].fingerprint = gcalFingerprint(block);
        gcalLastFingerprints.set(item.blockId, finalMap[item.blockId].fingerprint);
      }
    });
    if (writebacks.length) {
      gcalWritebackIds(writebacks).catch((error) => console.warn("GCal id writeback failed.", error));
    }
  }

  async function gcalWritebackIds(items) {
    const calendarPath = encodeURIComponent(gcal.calendarId);
    for (const item of items) {
      const res = await gcalApi(`/calendars/${calendarPath}/events/${encodeURIComponent(item.eventId)}`, {
        method: "PATCH",
        body: { extendedProperties: { private: { lifeBinderId: item.blockId } } }
      });
      if (res.ok) {
        const data = await res.json();
        const map = gcalSyncMap();
        if (map[item.blockId]) {
          map[item.blockId].updated = data.updated || map[item.blockId].updated;
          map[item.blockId].etag = data.etag || map[item.blockId].etag;
        }
      }
    }
    saveLocalState();
    queueRemoteSave();
  }

  function gcalHandleFailure(error, kind) {
    console.warn("GCal sync failed.", kind, error);
    gcalFailureCount += 1;
    const needsAuth = /oauth|consent|interaction|access_denied|popup|invalid_grant/i.test(String(error?.message || error));
    setGcalStatus(needsAuth ? "GCal 재연결 필요" : `GCal ${kind === "push" ? "전송" : "동기화"} 실패`);
    if (gcalFailureCount >= GCAL_FAILURE_ALERT_AT && !gcalFailureAlerted) {
      gcalFailureAlerted = true;
      window.alert(`Google 캘린더 동기화가 ${gcalFailureCount}회 연속 실패했습니다.\n설정 탭에서 연결 상태를 확인해 주세요.`);
    }
  }

  async function gcalSyncNow(manual) {
    try {
      await gcalPullNow(manual);
    } catch (error) {
      gcalHandleFailure(error, "pull");
    }
  }

  function gcalSetupPolling() {
    if (gcalPollTimer) {
      window.clearInterval(gcalPollTimer);
      gcalPollTimer = null;
    }
    const minutes = Number(gcal.pollMinutes) || 0;
    if (!minutes || !gcalEnabled() || !gcalConnected()) return;
    gcalPollTimer = window.setInterval(() => {
      if (!document.hidden) gcalSyncNow(false);
    }, minutes * 60 * 1000);
  }

  function gcalInit() {
    if (gcalInitialized) {
      gcalRefreshFingerprintCache();
      return;
    }
    gcalInitialized = true;
    gcalRefreshFingerprintCache();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && gcalEnabled() && gcalConnected() && authStatus === "signed-in") gcalSyncNow(false);
    });
    if (gcalEnabled() && gcalConnected()) {
      gcalSyncNow(false);
      gcalSetupPolling();
    }
  }

  async function gcalConnect() {
    if (!gcal.clientId) {
      setGcalStatus("Client ID를 먼저 저장해 주세요.");
      return;
    }
    try {
      setGcalStatus("Google 연결 중...");
      await gcalRequestToken(true);
      const primary = await gcalApi("/calendars/primary");
      if (primary.ok) {
        const data = await primary.json();
        gcal.email = data.id || "";
      }
      await gcalEnsureCalendar();
      saveGcalLocal();
      gcalFailureCount = 0;
      gcalFailureAlerted = false;
      setGcalStatus("");
      render();
      gcalSetupPolling();
      await gcalSyncNow(true);
    } catch (error) {
      gcalHandleFailure(error, "pull");
      render();
    }
  }

  function gcalDisconnect() {
    if (gcal.token && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(gcal.token, () => {});
      } catch (error) {
        console.warn("GCal revoke failed.", error);
      }
    }
    gcal.token = "";
    gcal.tokenExpiresAt = 0;
    gcal.email = "";
    gcal.syncToken = "";
    saveGcalLocal();
    if (gcalPollTimer) {
      window.clearInterval(gcalPollTimer);
      gcalPollTimer = null;
    }
    setGcalStatus("");
    render();
  }

  function renderSettingsView() {
    const connected = gcalConnected();
    const pollChoices = [
      { value: 1, label: "1분마다" },
      { value: 5, label: "5분마다 (권장)" },
      { value: 15, label: "15분마다" },
      { value: 0, label: "수동으로만" }
    ];
    return `
      <div class="view-grid settings-grid">
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Google 캘린더 연동</h2>
              <p class="panel-subtitle">Plan 일정을 전용 "Schedule Binder" 캘린더와 양방향으로 동기화합니다. 실행(Do) 기록은 앱 안에만 남습니다.</p>
            </div>
          </div>
          <div class="panel-body settings-body">
            <label class="settings-field">
              <span>OAuth Client ID</span>
              <input type="text" data-gcal-client-id value="${attr(gcal.clientId)}" placeholder="예: 1234567890-xxxx.apps.googleusercontent.com" autocomplete="off" spellcheck="false">
            </label>
            <div class="settings-actions">
              <button type="button" class="text-btn" data-gcal-save-client>Client ID 저장</button>
              ${connected ? `
                <button type="button" class="text-btn primary" data-gcal-sync-now>지금 동기화</button>
                <button type="button" class="text-btn" data-gcal-disconnect>연결 해제</button>
              ` : `
                <button type="button" class="text-btn primary" data-gcal-connect ${gcal.clientId ? "" : "disabled"}>Google 계정 연결</button>
              `}
            </div>
            <dl class="settings-meta">
              <div><dt>연결 계정</dt><dd>${esc(gcal.email || "-")}</dd></div>
              <div><dt>LB → GCal 마지막 전송</dt><dd data-gcal-last-push>${esc(gcalTimeLabel(gcal.lastPushAt))}</dd></div>
              <div><dt>GCal → LB 마지막 수신</dt><dd data-gcal-last-pull>${esc(gcalTimeLabel(gcal.lastPullAt))}</dd></div>
              <div><dt>상태</dt><dd data-gcal-settings-status>${esc(gcalStatusText || (connected ? "정상" : "미연결"))}</dd></div>
            </dl>
            <label class="settings-field">
              <span>GCal 변경 자동 확인 주기</span>
              <select data-gcal-poll>
                ${pollChoices.map((choice) => `<option value="${choice.value}" ${Number(gcal.pollMinutes) === choice.value ? "selected" : ""}>${esc(choice.label)}</option>`).join("")}
              </select>
            </label>
            <details class="settings-help">
              <summary>OAuth Client ID 발급 방법</summary>
              <ol>
                <li><a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>에서 새 프로젝트를 만듭니다.</li>
                <li>"API 및 서비스 → 라이브러리"에서 <strong>Google Calendar API</strong>를 사용 설정합니다.</li>
                <li>"OAuth 동의 화면"에서 외부(External) 유형으로 만들고, 본인 Google 계정을 테스트 사용자로 추가합니다.</li>
                <li>"사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID"에서 <strong>웹 애플리케이션</strong>을 선택합니다.</li>
                <li>"승인된 JavaScript 원본"에 이 앱의 주소를 추가합니다 (예: <code>https://xyzics82.github.io</code>, 로컬 테스트 시 <code>http://localhost:8000</code>).</li>
                <li>생성된 Client ID를 복사해 위 입력칸에 붙여넣고 저장 → "Google 계정 연결"을 누릅니다.</li>
              </ol>
              <p>자세한 절차는 README의 "Google 캘린더 연동" 항목에도 있습니다.</p>
            </details>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">스트라바 연동 (자전거)</h2>
              <p class="panel-subtitle">가민 커넥트의 라이딩이 스트라바를 거쳐 오늘 탭·루틴·통계에 자동으로 나타납니다.</p>
            </div>
          </div>
          <div class="panel-body settings-body">
            <label class="settings-field">
              <span>Client ID</span>
              <input type="text" data-strava-client-id value="${attr(strava.clientId)}" placeholder="예: 123456" autocomplete="off" spellcheck="false">
            </label>
            <label class="settings-field">
              <span>Client Secret</span>
              <input type="password" data-strava-client-secret value="${attr(strava.clientSecret)}" placeholder="스트라바 API 앱의 Secret" autocomplete="off" spellcheck="false">
            </label>
            <div class="settings-actions">
              <button type="button" class="text-btn" data-strava-save-keys>키 저장</button>
              ${stravaConnected() ? `
                <button type="button" class="text-btn primary" data-strava-sync>지금 동기화</button>
                <button type="button" class="text-btn" data-strava-disconnect>연결 해제</button>
              ` : `
                <button type="button" class="text-btn primary" data-strava-connect ${strava.clientId && strava.clientSecret ? "" : "disabled"}>스트라바 계정 연결</button>
              `}
            </div>
            <dl class="settings-meta">
              <div><dt>연결 계정</dt><dd>${esc(strava.athleteName || "-")}</dd></div>
              <div><dt>마지막 동기화</dt><dd>${esc(stravaTimeLabel(strava.lastSyncAt))}</dd></div>
              <div><dt>상태</dt><dd>${esc(stravaStatusText || (stravaConnected() ? "정상" : "미연결"))}</dd></div>
            </dl>
            <details class="settings-help">
              <summary>1단계: 가민 커넥트 → 스트라바 자동 업로드 (1회 설정)</summary>
              <ol>
                <li>스마트폰 <strong>가민 커넥트</strong> 앱 → 프로필 → 설정 → <strong>연결된 앱(Connected Apps)</strong>.</li>
                <li>목록에서 <strong>Strava</strong>를 선택하고 계정을 연결합니다.</li>
                <li>이후 자전거를 타고 기기를 동기화하면 라이딩이 스트라바에 자동으로 올라갑니다.</li>
              </ol>
            </details>
            <details class="settings-help">
              <summary>2단계: 스트라바 API 키 발급 (약 5분, 1회)</summary>
              <ol>
                <li><a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a>에서 API 앱을 만듭니다 (이름 예: Schedule Binder).</li>
                <li><strong>Authorization Callback Domain</strong>에 이 앱의 도메인을 입력합니다 (예: <code>xyzics82.github.io</code>, 로컬 테스트 시 <code>localhost</code>).</li>
                <li>발급된 <strong>Client ID</strong>와 <strong>Client Secret</strong>을 위 칸에 붙여넣고 "키 저장" → "스트라바 계정 연결"을 누릅니다.</li>
              </ol>
              <p>키는 이 브라우저(localStorage)에만 저장되는 개인용 연동입니다. 라이딩이 있는 날은 '자전거' 루틴이 자동으로 체크됩니다.</p>
            </details>
          </div>
        </section>
      </div>
    `;
  }

  function bindGcalEvents() {
    const saveButton = app.querySelector("[data-gcal-save-client]");
    if (saveButton) {
      saveButton.addEventListener("click", () => {
        const input = app.querySelector("[data-gcal-client-id]");
        const next = String(input?.value || "").trim();
        if (next !== gcal.clientId) {
          gcal.clientId = next;
          gcalTokenClient = null;
          saveGcalLocal();
        }
        render();
      });
    }
    const connectButton = app.querySelector("[data-gcal-connect]");
    if (connectButton) {
      connectButton.addEventListener("click", () => {
        gcalConnect();
      });
    }
    const disconnectButton = app.querySelector("[data-gcal-disconnect]");
    if (disconnectButton) {
      disconnectButton.addEventListener("click", gcalDisconnect);
    }
    const syncButton = app.querySelector("[data-gcal-sync-now]");
    if (syncButton) {
      syncButton.addEventListener("click", () => {
        gcalSyncNow(true);
      });
    }
    const pollSelect = app.querySelector("[data-gcal-poll]");
    if (pollSelect) {
      pollSelect.addEventListener("change", () => {
        gcal.pollMinutes = Number(pollSelect.value) || 0;
        saveGcalLocal();
        gcalSetupPolling();
      });
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `schedule-binder-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  initializeApp();
})();
