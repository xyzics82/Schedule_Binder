(function () {
  "use strict";

  const STORE_KEY = "life-binder-web-state-v1";
  const app = document.getElementById("app");

  const categories = [
    { id: "work", name: "업무", color: "#0f766e" },
    { id: "study", name: "학습", color: "#5b57c8" },
    { id: "health", name: "건강", color: "#2f8f6b" },
    { id: "relation", name: "관계", color: "#c95537" },
    { id: "rest", name: "휴식", color: "#b7791f" },
    { id: "admin", name: "정리", color: "#667085" }
  ];

  const DAY_START_HOUR = 6;
  const DAY_END_HOUR = 24;
  const SNAP_MINUTES = 30;

  const navItems = [
    { id: "week", label: "주간", icon: "W" },
    { id: "today", label: "오늘", icon: "T" },
    { id: "paper", label: "페이퍼", icon: "A" },
    { id: "month", label: "월간", icon: "M" },
    { id: "goals", label: "목표", icon: "G" },
    { id: "projects", label: "프로젝트", icon: "P" },
    { id: "binder", label: "서브 바인더", icon: "B" },
    { id: "review", label: "리뷰", icon: "R" },
    { id: "stats", label: "통계", icon: "S" },
    { id: "guide", label: "가이드", icon: "?" }
  ];

  let state = loadState();
  let drawState = null;

  function todayISO() {
    return toISO(new Date());
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
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
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

  function durationPercent(start, end) {
    return Math.max(3.2, linePercent(end) - linePercent(start));
  }

  function minutesToText(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return `${h}시간 ${m}분`;
    if (h) return `${h}시간`;
    return `${m}분`;
  }

  function categoryById(id) {
    return categories.find((item) => item.id === id) || categories[0];
  }

  function goalById(id) {
    return state.goals.find((item) => item.id === id);
  }

  function projectById(id) {
    return state.projects.find((item) => item.id === id);
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

  function normalizeState(next) {
    return {
      activeView: next.activeView || "week",
      currentDate: next.currentDate || todayISO(),
      goals: Array.isArray(next.goals) ? next.goals : [],
      projects: Array.isArray(next.projects) ? next.projects : [],
      tasks: Array.isArray(next.tasks) ? next.tasks.map(normalizeTask) : [],
      blocks: Array.isArray(next.blocks) ? next.blocks.map(normalizeBlock) : [],
      notes: Array.isArray(next.notes) ? next.notes : [],
      reviews: next.reviews || { daily: {}, weekly: {} }
    };
  }

  function normalizeTask(task) {
    return {
      ...task,
      done: Boolean(task.done)
    };
  }

  function normalizeBlock(block) {
    const actualText = block.actualText || "";
    const hasActual = Boolean(actualText.trim() || block.actualDone || block.actualStart || block.actualEnd || block.actualOnly);
    return {
      ...block,
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
      goals: [
        {
          id: goalA,
          title: "나의 시간 사용을 보이게 만들기",
          category: "성장",
          description: "매일 10분 기록하고 주간 리뷰로 다음 행동을 정한다.",
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
          description: "목표, 시간, 리뷰, 지식 노트를 연결하는 첫 버전.",
          dueDate: addDays(today, 14),
          status: "active"
        },
        {
          id: projectB,
          goalId: goalB,
          title: "주 3회 운동 루틴",
          description: "짧게라도 반복 가능한 운동 시간을 확보한다.",
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
          priority: "high",
          done: false
        },
        {
          id: uid("task"),
          projectId: projectB,
          goalId: goalB,
          title: "저녁 산책 30분",
          dueDate: today,
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
          categoryId: "work",
          status: "planned",
          actualStart: "09:10",
          actualEnd: "09:55",
          actualText: "45분 집중, 다음 작업 목록 정리",
          actualDone: true,
          actualOnly: false,
          cancelled: false,
          cancelMemo: "",
          memoText: "첫 실행 기록. 다음에는 계획보다 10분 늦게 시작한 이유를 확인하기.",
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
          categoryId: "health",
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
            top: ["오늘의 핵심 일정 잡기", "미완료 할 일 줄이기", "저녁에 3줄 회고"],
            text: ""
          }
        },
        weekly: {
          [weekStart]: {
            wins: "",
            lessons: "",
            next: "다음 주에도 기록을 먼저 열어본다."
          }
        }
      }
    };
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function setState(mutator) {
    mutator(state);
    saveState();
    render();
  }

  function render() {
    const title = navItems.find((item) => item.id === state.activeView)?.label || "오늘";
    app.innerHTML = `
      <div class="app-shell">
        ${renderSidebar()}
        <main class="main">
          ${renderTopbar(title)}
          <div class="workspace">${renderActiveView()}</div>
        </main>
      </div>
    `;
    bindEvents();
  }

  function renderSidebar() {
    const completed = state.tasks.filter((task) => task.done).length;
    const total = state.tasks.length || 1;
    const rate = Math.round((completed / total) * 100);
    const executedBlocks = state.blocks.filter(blockIsExecuted).length;
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
            <button class="nav-btn ${state.activeView === item.id ? "is-active" : ""}" data-view="${item.id}" title="${esc(item.label)}">
              <span class="nav-icon" aria-hidden="true">${esc(item.icon)}</span>
              <span class="nav-label">${esc(item.label)}</span>
            </button>
          `).join("")}
        </nav>
        <div class="sidebar-footer">
          <div class="mini-stat">
            <strong>${rate}%</strong>
            <span>전체 할 일 완료율</span>
          </div>
          <div class="mini-stat">
            <strong>${executedBlocks}/${state.blocks.length}</strong>
            <span>실행 기록된 시간 블록</span>
          </div>
        </div>
      </aside>
    `;
  }

  function renderTopbar(title) {
    const subtitle = getSubtitle();
    return `
      <header class="topbar">
        <div>
          <h1>${esc(title)}</h1>
          <p>${esc(subtitle)}</p>
        </div>
        <div class="toolbar">
          <button class="icon-btn" data-date-shift="-1" title="이전">‹</button>
          <span class="date-chip">${esc(getDateLabel())}</span>
          <button class="icon-btn" data-date-shift="1" title="다음">›</button>
          <button class="text-btn" data-today title="오늘로 이동">오늘</button>
          <button class="text-btn" data-export title="JSON으로 내보내기">내보내기</button>
        </div>
      </header>
    `;
  }

  function getSubtitle() {
    if (state.activeView === "week") {
      return `${formatDate(startOfWeek(state.currentDate))}부터 ${formatDate(endOfWeek(state.currentDate))}까지`;
    }
    if (state.activeView === "month") {
      return `${monthTitle(state.currentDate)} 로드맵`;
    }
    if (state.activeView === "paper") {
      return "한 장짜리 주간 바인더 시트입니다.";
    }
    if (state.activeView === "stats") {
      return "계획과 실제 시간의 흐름을 확인합니다.";
    }
    if (state.activeView === "guide") {
      return "주요 기능의 사용 예시를 한 곳에서 봅니다.";
    }
    return "오늘의 실행과 다음 리뷰까지 한 번에 봅니다.";
  }

  function getDateLabel() {
    if (state.activeView === "month") return monthTitle(state.currentDate);
    if (state.activeView === "paper") return `${formatDate(startOfWeek(state.currentDate))} 주`;
    if (state.activeView === "week") return `${formatDate(startOfWeek(state.currentDate))} 주`;
    return formatDate(state.currentDate);
  }

  function renderActiveView() {
    switch (state.activeView) {
      case "week":
        return renderWeekView();
      case "paper":
        return renderPaperView();
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
    const tasks = state.tasks
      .filter((task) => !task.done && (!task.dueDate || task.dueDate <= date))
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

    return `
      <div class="today-layout">
        <section class="panel sheet today-record-panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">오늘 스케줄 요약</h2>
              <p class="panel-subtitle">주간에서 그은 계획과 실행만 간단히 보고, 각 항목에 메모와 사진을 연결합니다.</p>
            </div>
            <button class="text-btn primary" data-view="week">주간 보기</button>
          </div>
          <div class="panel-body">
            <div class="today-linked-list">
              ${blocks.length ? blocks.map(renderTodayLinkedRecord).join("") : `<div class="empty">오늘 주간표에 입력된 계획이나 실행이 없습니다.</div>`}
            </div>
          </div>
        </section>
        <aside class="today-side">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">오늘의 핵심 3가지</h2>
                <p class="panel-subtitle">오늘 반드시 남길 행동만 적습니다.</p>
              </div>
            </div>
            <div class="panel-body">
              <div class="top-three">
                ${[0, 1, 2].map((idx) => `
                  <input class="daily-top" data-top-index="${idx}" value="${attr(log.top[idx] || "")}" placeholder="핵심 행동 ${idx + 1}">
                `).join("")}
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">미완료 할 일</h2>
                <p class="panel-subtitle">${tasks.length}개가 오늘의 주의를 기다립니다.</p>
              </div>
            </div>
            <div class="panel-body">
              ${renderTaskForm(date)}
              <div class="list" style="margin-top: 12px;">
                ${tasks.length ? tasks.map(renderTaskRow).join("") : `<div class="empty">오늘 처리할 할 일이 없습니다.</div>`}
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">3줄 회고</h2>
                <p class="panel-subtitle">짧게 남겨도 다음 계획의 재료가 됩니다.</p>
              </div>
            </div>
            <div class="panel-body review-box">
              <textarea class="daily-review" data-review-date="${attr(date)}" placeholder="오늘 배운 것, 잘한 것, 내일 조정할 것을 적어보세요.">${esc(log.text || "")}</textarea>
              <span class="save-hint">입력 후 포커스를 벗어나면 자동 저장됩니다.</span>
            </div>
          </section>
        </aside>
      </div>
    `;
  }

  function renderTodayLinkedRecord(block) {
    const category = categoryById(block.categoryId);
    const hasPlan = !block.actualOnly;
    const hasActual = blockHasActualLine(block);
    return `
      <article class="today-linked-record">
        <div class="today-schedule-card" style="border-left-color:${attr(category.color)}">
          <div class="today-card-head">
            <span>${esc(category.name)}</span>
            <strong>${esc(hasActual ? "실행 기록" : "계획")}</strong>
          </div>
          ${hasPlan ? `
            <button type="button" class="today-plan-chip ${block.cancelled ? "is-cancelled" : ""}" data-edit-plan="${attr(block.id)}">
              <span>계획</span>
              <strong>${esc(block.start)}-${esc(block.end)}</strong>
              <em>${esc(block.title)}</em>
            </button>
          ` : ""}
          ${block.cancelled ? `
            <button type="button" class="today-cancel-note" data-open-cancel="${attr(block.id)}">취소 메모 보기</button>
          ` : ""}
          ${hasActual ? `
            <button type="button" class="today-actual-chip" data-edit-actual="${attr(block.id)}">
              <span>실행</span>
              <strong>${esc(block.actualStart || block.start)}-${esc(block.actualEnd || block.end)}</strong>
              <em>${esc(block.actualText || block.title)}</em>
            </button>
          ` : `<div class="today-empty-actual">아직 실행 기록 없음</div>`}
        </div>
        <div class="today-connector" aria-hidden="true"><span></span></div>
        <div class="today-note-card ${blockHasLinkedNote(block) ? "has-note" : ""}">
          <label class="note-label" for="memo-${attr(block.id)}">연결 메모</label>
          <textarea id="memo-${attr(block.id)}" class="block-memo" data-block-id="${attr(block.id)}" placeholder="이 일정에서 남길 생각, 결과, 다음 행동">${esc(block.memoText || "")}</textarea>
          <div class="photo-strip">
            ${(block.photos || []).map((photo, idx) => `
              <figure>
                <img src="${attr(photo)}" alt="연결 사진 ${idx + 1}">
                <button type="button" data-delete-block-photo="${attr(block.id)}" data-photo-index="${idx}" title="사진 삭제">×</button>
              </figure>
            `).join("")}
            <label class="photo-add">
              사진 추가
              <input class="block-photo-input" type="file" accept="image/*" multiple data-block-id="${attr(block.id)}">
            </label>
          </div>
        </div>
      </article>
    `;
  }

  function blockHasLinkedNote(block) {
    return Boolean((block.memoText || "").trim() || (block.photos || []).length);
  }

  function renderTimeline(blocks) {
    const rows = [];
    for (let hour = 6; hour <= 23; hour += 1) {
      const planBlocks = blocks.filter((block) => {
        if (block.actualOnly) return false;
        const start = minutesFromTime(block.start);
        const end = minutesFromTime(block.end);
        return start < (hour + 1) * 60 && end > hour * 60;
      });
      const actualBlocks = blocks.filter((block) => {
        if (!blockHasActualLine(block)) return false;
        const start = minutesFromTime(block.actualStart || block.start);
        const end = minutesFromTime(block.actualEnd || block.end);
        return start < (hour + 1) * 60 && end > hour * 60;
      });
      rows.push(`
        <div class="timeline-row">
          <div class="timeline-hour">${String(hour).padStart(2, "0")}:00</div>
          <div class="timeline-lane plan-lane">
            <div class="lane-title">계획</div>
            ${planBlocks.length ? planBlocks.map(renderPlanLine).join("") : `<div class="line-placeholder">계획 없음</div>`}
          </div>
          <div class="timeline-lane actual-lane">
            <div class="lane-title">실행</div>
            ${actualBlocks.length ? actualBlocks.map(renderActualLine).join("") : `<div class="line-placeholder">기록 없음</div>`}
          </div>
        </div>
      `);
    }
    return `<div class="timeline">${rows.join("")}</div>`;
  }

  function renderPlanLine(block) {
    const category = categoryById(block.categoryId);
    const executed = blockIsExecuted(block);
    return `
      <div class="plan-line ${executed ? "is-executed" : ""} ${block.cancelled ? "is-cancelled" : ""}" style="border-left-color:${attr(category.color)}">
        <label class="inline-check" title="실행 완료 표시">
          <input class="block-done" type="checkbox" data-block-id="${attr(block.id)}" ${block.actualDone ? "checked" : ""}>
          <span>${esc(block.start)}-${esc(block.end)} ${esc(block.title)}</span>
        </label>
        <button type="button" data-delete-block="${attr(block.id)}" title="일정 삭제">×</button>
      </div>
    `;
  }

  function renderActualLine(block) {
    const executed = blockIsExecuted(block);
    return `
      <input class="actual-input ${executed ? "is-executed" : ""}" data-block-id="${attr(block.id)}" value="${attr(block.actualText || "")}" placeholder="실행한 내용">
    `;
  }

  function blockIsExecuted(block) {
    return Boolean((block.actualText || "").trim() || block.actualDone);
  }

  function blockHasActualLine(block) {
    return Boolean(block.actualOnly || block.actualDone || (block.actualText || "").trim() || (block.actualStart && block.actualEnd));
  }

  function renderScheduleForm(defaultDate) {
    return `
      <form class="form-grid" data-form="schedule">
        <div class="field">
          <label for="schedule-title">일정명</label>
          <input id="schedule-title" name="title" required placeholder="예: 주간 리뷰 작성">
        </div>
        <div class="form-row">
          <div class="field">
            <label for="schedule-date">날짜</label>
            <input id="schedule-date" name="date" type="date" value="${attr(defaultDate)}" required>
          </div>
          <div class="field">
            <label for="schedule-category">영역</label>
            <select id="schedule-category" name="categoryId">
              ${categories.map((item) => `<option value="${attr(item.id)}">${esc(item.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="schedule-start">시작</label>
            <input id="schedule-start" name="start" type="time" value="09:00" required>
          </div>
          <div class="field">
            <label for="schedule-end">종료</label>
            <input id="schedule-end" name="end" type="time" value="10:00" required>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="schedule-goal">목표</label>
            <select id="schedule-goal" name="goalId">
              <option value="">연결 없음</option>
              ${state.goals.map((goal) => `<option value="${attr(goal.id)}">${esc(goal.title)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="schedule-project">프로젝트</label>
            <select id="schedule-project" name="projectId">
              <option value="">연결 없음</option>
              ${state.projects.map((project) => `<option value="${attr(project.id)}">${esc(project.title)}</option>`).join("")}
            </select>
          </div>
        </div>
        <button class="text-btn primary" type="submit">일정 추가</button>
      </form>
    `;
  }

  function renderTaskForm(defaultDate, projectId) {
    return `
      <form class="quick-line" data-form="task">
        <div class="field">
          <label for="task-title-${attr(projectId || "today")}">할 일</label>
          <input id="task-title-${attr(projectId || "today")}" name="title" required placeholder="새 할 일">
          <input type="hidden" name="projectId" value="${attr(projectId || "")}">
          <input type="hidden" name="dueDate" value="${attr(defaultDate)}">
        </div>
        <button class="text-btn primary" type="submit">추가</button>
      </form>
    `;
  }

  function renderTaskRow(task) {
    const goal = goalById(task.goalId);
    const project = projectById(task.projectId);
    return `
      <div class="list-row ${task.done ? "is-done" : ""}">
        <input class="task-check" type="checkbox" data-task-id="${attr(task.id)}" ${task.done ? "checked" : ""} title="완료">
        <div>
          <p class="row-title">${esc(task.title)}</p>
          <p class="row-meta">${esc(task.dueDate || "마감 없음")}${project ? ` · ${esc(project.title)}` : ""}${goal ? ` · ${esc(goal.title)}` : ""}</p>
        </div>
        <button class="icon-btn" data-delete-task="${attr(task.id)}" title="할 일 삭제">×</button>
      </div>
    `;
  }

  function renderWeekView() {
    const start = startOfWeek(state.currentDate);
    const days = Array.from({ length: 7 }, (_, idx) => addDays(start, idx));
    const weekBlocks = state.blocks.filter((block) => block.date >= start && block.date <= endOfWeek(state.currentDate));
    const weekTasks = state.tasks
      .filter((task) => !task.dueDate || (task.dueDate >= start && task.dueDate <= endOfWeek(state.currentDate)))
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    const stats = categoryStats(weekBlocks.filter((block) => !block.actualOnly && !block.cancelled));
    const review = ensureWeeklyReview(start);
    return `
      <div class="full-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">주간 계획판</h2>
              <p class="panel-subtitle">월간 목표를 이번 주 행동으로 내립니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="week-focus-grid">
              <div>
                <h3 class="section-label">이번 주 체크박스</h3>
                ${renderTaskForm(state.currentDate)}
                <div class="week-check-list">
                  ${weekTasks.length ? weekTasks.map(renderTaskRow).join("") : `<div class="empty">이번 주 할 일이 없습니다.</div>`}
                </div>
              </div>
              <div>
                <h3 class="section-label">주간 작성 방식</h3>
                <div class="highlight-note">
                  계획 레인에서 드래그하면 계획 라인이, 실행 레인에서 드래그하면 실행 라인이 생깁니다. 취소 체크를 켜면 작은 취소 메모가 남습니다.
                </div>
              </div>
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
                <p class="panel-subtitle">카테고리별 계획 시간을 합산합니다.</p>
              </div>
            </div>
            <div class="panel-body">
              ${renderStatsBars(stats)}
            </div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">주간 리뷰</h2>
                <p class="panel-subtitle">좋았던 것, 배운 것, 다음 초점을 정합니다.</p>
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
    const tasks = state.tasks.filter((task) => task.dueDate === day);
    const isCurrent = day === todayISO();
    const plannedBlocks = blocks.filter((block) => !block.actualOnly);
    const actualBlocks = blocks.filter(blockHasActualLine);
    return `
      <div class="day-column ${isCurrent ? "is-current" : ""}">
        <button class="day-head" data-select-date="${attr(day)}" title="이 날짜 열기">
          <div class="day-name">${esc(formatDate(day, { weekday: "short" }))}</div>
          <div class="day-date">${esc(formatDate(day, { month: "numeric", day: "numeric" }))}</div>
        </button>
        <div class="day-checks">
          <form class="day-task-form" data-form="task">
            <input name="title" required placeholder="체크박스 추가">
            <input type="hidden" name="dueDate" value="${attr(day)}">
            <input type="hidden" name="projectId" value="">
            <button type="submit" title="추가">+</button>
          </form>
          ${tasks.length ? tasks.map((task) => `
            <div class="day-check ${task.done ? "is-done" : ""}">
              <input class="task-check" type="checkbox" data-task-id="${attr(task.id)}" ${task.done ? "checked" : ""} title="완료">
              <input class="task-title-input" data-task-id="${attr(task.id)}" value="${attr(task.title)}" title="할 일 수정">
            </div>
          `).join("") : `<span class="day-empty">아직 체크박스가 없습니다.</span>`}
        </div>
        <div class="day-draw-board">
          <div class="day-axis">${renderTimeAxis()}</div>
          <div class="draw-lane plan-draw-lane" data-draw-lane="plan" data-date="${attr(day)}" title="드래그해서 계획 라인 만들기">
            <div class="draw-lane-title">계획</div>
            ${plannedBlocks.map(renderPlanSegment).join("")}
          </div>
          <div class="draw-lane actual-draw-lane" data-draw-lane="actual" data-date="${attr(day)}" title="드래그해서 실행 라인 만들기">
            <div class="draw-lane-title">실행</div>
            ${actualBlocks.map(renderActualSegment).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderTimeAxis() {
    const rows = [];
    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += 1) {
      rows.push(`<span>${String(hour).padStart(2, "0")}</span>`);
    }
    return rows.join("");
  }

  function renderPlanSegment(block) {
    const category = categoryById(block.categoryId);
    const top = linePercent(block.start);
    const height = durationPercent(block.start, block.end);
    return `
      <div class="time-segment plan-segment ${block.cancelled ? "is-cancelled" : ""}" data-edit-plan="${attr(block.id)}" style="top:${top}%; height:${height}%; border-left-color:${attr(category.color)}">
        <div class="segment-head">
          <strong>${esc(block.title)}</strong>
          <span>${esc(block.start)}-${esc(block.end)}</span>
        </div>
        <label class="segment-cancel" title="취소 또는 완전 변경 표시">
          <input class="cancel-check" type="checkbox" data-block-id="${attr(block.id)}" ${block.cancelled ? "checked" : ""}>
          <span>취소</span>
        </label>
        ${block.cancelled ? `<button class="cancel-memo" data-open-cancel="${attr(block.id)}" title="취소 메모 보기">취소: ${esc(shortText(block.cancelMemo || "메모 없음", 18))}</button>` : ""}
      </div>
    `;
  }

  function renderActualSegment(block) {
    const top = linePercent(block.actualStart || block.start);
    const height = durationPercent(block.actualStart || block.start, block.actualEnd || block.end);
    return `
      <div class="time-segment actual-segment" data-edit-actual="${attr(block.id)}" style="top:${top}%; height:${height}%">
        <div class="segment-head">
          <strong>${esc(block.actualText || "실행 내용")}</strong>
          <span>${esc(block.actualStart || block.start)}-${esc(block.actualEnd || block.end)}</span>
        </div>
      </div>
    `;
  }

  function shortText(text, max) {
    const clean = String(text || "").trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max)}...`;
  }

  function renderWeeklyReviewForm(weekStart, review) {
    return `
      <form class="form-grid" data-form="weekly-review" data-week-start="${attr(weekStart)}">
        <div class="field">
          <label for="wins">이번 주 성과</label>
          <textarea id="wins" name="wins" placeholder="완료한 일과 의미 있었던 장면">${esc(review.wins || "")}</textarea>
        </div>
        <div class="field">
          <label for="lessons">배운 점</label>
          <textarea id="lessons" name="lessons" placeholder="계획과 실제가 달랐던 이유">${esc(review.lessons || "")}</textarea>
        </div>
        <div class="field">
          <label for="next">다음 주 초점</label>
          <textarea id="next" name="next" placeholder="줄일 일과 늘릴 일">${esc(review.next || "")}</textarea>
        </div>
        <button class="text-btn primary" type="submit">리뷰 저장</button>
      </form>
    `;
  }

  function renderPaperView() {
    const weekStart = startOfWeek(state.currentDate);
    const weekEnd = endOfWeek(state.currentDate);
    const days = Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx));
    const review = ensureWeeklyReview(weekStart);
    return `
      <form class="paper-page" data-form="paper-week" data-week-start="${attr(weekStart)}">
        <div class="paper-header">
          <div>
            <p class="paper-kicker">Life Binder Weekly Sheet</p>
            <h2>주간 바인더 시트</h2>
          </div>
          <div class="paper-date-box">
            <span>${esc(monthTitle(state.currentDate))}</span>
            <strong>${esc(formatDate(weekStart))} - ${esc(formatDate(weekEnd))}</strong>
          </div>
        </div>
        <div class="paper-top">
          <section class="paper-box paper-memory">
            <h3>잊지 말 것</h3>
            <textarea name="dontForget" placeholder="이번 주 꼭 기억할 일">${esc(review.dontForget || "")}</textarea>
          </section>
          <section class="paper-box">
            <h3>업무 목표</h3>
            ${renderPaperObjectives("businessObjectives", review.businessObjectives)}
          </section>
          <section class="paper-box">
            <h3>개인 목표</h3>
            ${renderPaperObjectives("personalObjectives", review.personalObjectives)}
          </section>
        </div>
        <div class="paper-body">
          <aside class="paper-side">
            <section class="paper-box">
              <h3>주간 회의 / 메모</h3>
              <textarea name="meetingNotes" placeholder="회의, 약속, 준비할 자료">${esc(review.meetingNotes || "")}</textarea>
            </section>
            <section class="paper-box">
              <h3>체크 / 습관</h3>
              ${renderPaperHabitMatrix(review.habits)}
            </section>
            <section class="paper-box">
              <h3>감사 / 마무리</h3>
              <textarea name="thanks" placeholder="감사한 일, 칭찬, 주간 마무리">${esc(review.thanks || "")}</textarea>
            </section>
            <button class="text-btn primary" type="submit">페이퍼 저장</button>
          </aside>
          <section class="paper-week-grid">
            ${days.map(renderPaperDay).join("")}
          </section>
        </div>
      </form>
    `;
  }

  function renderPaperObjectives(name, values) {
    const items = normalizeFixedList(values, 5);
    return `
      <div class="paper-objectives">
        ${items.map((item, idx) => `
          <label>
            <input type="checkbox" name="${attr(name)}Done${idx}" ${item.done ? "checked" : ""}>
            <input name="${attr(name)}${idx}" value="${attr(item.text)}" placeholder="목표 ${idx + 1}">
          </label>
        `).join("")}
      </div>
    `;
  }

  function renderPaperHabitMatrix(values) {
    const habits = normalizeHabitRows(values);
    const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
    return `
      <div class="habit-matrix">
        <div class="habit-head"></div>
        ${dayLabels.map((day) => `<div class="habit-head">${day}</div>`).join("")}
        ${habits.map((habit, row) => `
          <input class="habit-name" name="habitName${row}" value="${attr(habit.name)}" placeholder="습관 ${row + 1}">
          ${dayLabels.map((_, col) => `
            <label class="habit-check">
              <input type="checkbox" name="habit${row}_${col}" ${habit.days[col] ? "checked" : ""}>
            </label>
          `).join("")}
        `).join("")}
      </div>
    `;
  }

  function renderPaperDay(day) {
    const blocks = blocksForDate(day);
    const tasks = state.tasks.filter((task) => task.dueDate === day);
    const plans = blocks.filter((block) => !block.actualOnly);
    const actuals = blocks.filter(blockHasActualLine);
    return `
      <article class="paper-day ${day === todayISO() ? "is-current" : ""}">
        <button class="paper-day-head" data-select-date="${attr(day)}" type="button">
          <strong>${esc(formatDate(day, { weekday: "short" }))}</strong>
          <span>${esc(formatDate(day, { month: "numeric", day: "numeric" }))}</span>
        </button>
        <div class="paper-event">
          <span>Event</span>
          <strong>${plans.slice(0, 2).map((block) => esc(block.title)).join(", ") || " "}</strong>
        </div>
        <div class="paper-todo">
          <span>To-do</span>
          ${tasks.length ? tasks.slice(0, 5).map((task) => `
            <label class="${task.done ? "is-done" : ""}">
              <input class="task-check" type="checkbox" data-task-id="${attr(task.id)}" ${task.done ? "checked" : ""}>
              <input class="task-title-input" data-task-id="${attr(task.id)}" value="${attr(task.title)}">
            </label>
          `).join("") : `<em>체크박스 없음</em>`}
        </div>
        ${renderPaperTimeline(plans, actuals)}
      </article>
    `;
  }

  function renderPaperTimeline(plans, actuals) {
    const rows = [];
    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour += 1) {
      const planItems = plans.filter((block) => overlapsHour(block.start, block.end, hour));
      const actualItems = actuals.filter((block) => overlapsHour(block.actualStart || block.start, block.actualEnd || block.end, hour));
      rows.push(`
        <div class="paper-time-row">
          <span class="paper-hour">${String(hour).padStart(2, "0")}</span>
          <div class="paper-plan-cell">
            ${planItems.map((block) => `
              <button type="button" class="paper-plan ${block.cancelled ? "is-cancelled" : ""}" data-edit-plan="${attr(block.id)}" title="계획 수정">
                ${esc(shortText(block.title, 14))}
                ${block.cancelled ? `<small data-open-cancel="${attr(block.id)}">취소 메모</small>` : ""}
              </button>
            `).join("")}
          </div>
          <div class="paper-actual-cell">
            ${actualItems.map((block) => `
              <button type="button" class="paper-actual" data-edit-actual="${attr(block.id)}" title="실행 수정">
                ${esc(shortText(block.actualText || block.title, 14))}
              </button>
            `).join("")}
          </div>
        </div>
      `);
    }
    return `<div class="paper-timeline">${rows.join("")}</div>`;
  }

  function overlapsHour(start, end, hour) {
    const from = minutesFromTime(start);
    const to = minutesFromTime(end);
    return from < (hour + 1) * 60 && to > hour * 60;
  }

  function normalizeFixedList(values, count) {
    const source = Array.isArray(values) ? values : [];
    return Array.from({ length: count }, (_, idx) => {
      const item = source[idx];
      if (typeof item === "string") return { text: item, done: false };
      return { text: item?.text || "", done: Boolean(item?.done) };
    });
  }

  function normalizeHabitRows(values) {
    const source = Array.isArray(values) ? values : [];
    return Array.from({ length: 4 }, (_, idx) => {
      const item = source[idx] || {};
      const days = Array.isArray(item.days) ? item.days : [];
      return {
        name: item.name || "",
        days: Array.from({ length: 7 }, (_, dayIdx) => Boolean(days[dayIdx]))
      };
    });
  }

  function renderMonthView() {
    const date = parseISO(state.currentDate);
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = new Date(first);
    const firstDay = first.getDay();
    gridStart.setDate(first.getDate() - (firstDay === 0 ? 6 : firstDay - 1));
    const days = Array.from({ length: 42 }, (_, idx) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + idx);
      return toISO(d);
    });
    return `
      <div class="full-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">월간 로드맵</h2>
              <p class="panel-subtitle">프로젝트 마일스톤과 반복 루틴을 한 달 단위로 봅니다.</p>
            </div>
          </div>
          <div class="panel-body month-scroll">
            <div class="month-grid">
              ${["월", "화", "수", "목", "금", "토", "일"].map((name) => `<div class="month-head">${name}</div>`).join("")}
              ${days.map((day) => renderMonthCell(day, month)).join("")}
            </div>
          </div>
        </section>
        <div class="view-grid">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">선택일 일정 추가</h2>
                <p class="panel-subtitle">${esc(formatDate(state.currentDate))}</p>
              </div>
            </div>
            <div class="panel-body">${renderScheduleForm(state.currentDate)}</div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">이번 달 프로젝트</h2>
                <p class="panel-subtitle">마감일이 이번 달인 프로젝트입니다.</p>
              </div>
            </div>
            <div class="panel-body">
              <div class="list">
                ${renderMonthlyProjects(year, month)}
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderMonthCell(day, currentMonth) {
    const date = parseISO(day);
    const isMuted = date.getMonth() !== currentMonth;
    const isSelected = day === state.currentDate;
    const blocks = blocksForDate(day);
    const tasks = state.tasks.filter((task) => task.dueDate === day);
    return `
      <button class="month-cell ${isMuted ? "is-muted" : ""} ${isSelected ? "is-selected" : ""}" data-select-date="${attr(day)}">
        <div class="month-number">
          <span>${date.getDate()}</span>
          <span>${blocks.length + tasks.length ? `${blocks.length + tasks.length}건` : ""}</span>
        </div>
        <div class="month-dots">
          ${blocks.slice(0, 6).map((block) => {
            const category = categoryById(block.categoryId);
            return `<span class="month-dot" style="background:${attr(category.color)}" title="${attr(block.title)}"></span>`;
          }).join("")}
          ${tasks.slice(0, 3).map(() => `<span class="month-dot" style="background:#667085" title="할 일"></span>`).join("")}
        </div>
      </button>
    `;
  }

  function renderMonthlyProjects(year, month) {
    const items = state.projects.filter((project) => {
      if (!project.dueDate) return false;
      const due = parseISO(project.dueDate);
      return due.getFullYear() === year && due.getMonth() === month;
    });
    if (!items.length) return `<div class="empty">이번 달 마감 프로젝트가 없습니다.</div>`;
    return items.map(renderProjectRow).join("");
  }

  function renderGoalsView() {
    return `
      <div class="view-grid">
        <section class="panel sheet">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">목표 목록</h2>
              <p class="panel-subtitle">연간 방향을 월간, 주간, 일간 행동으로 내려보냅니다.</p>
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
              <p class="panel-subtitle">구체적인 기간과 영역을 함께 남깁니다.</p>
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
              <p class="panel-subtitle">목표와 연결하면 주간 계획에서 더 잘 보입니다.</p>
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
          <span class="tag">할 일 ${tasks.filter((task) => task.done).length}/${tasks.length}</span>
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
            <span class="save-hint">오늘 화면의 회고와 같은 데이터입니다.</span>
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
                <p class="panel-subtitle">이번 주 계획된 시간 블록 기준입니다.</p>
              </div>
            </div>
            <div class="panel-body">${renderStatsBars(allStats)}</div>
          </section>
          <section class="panel sheet">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">목표별 투입 시간</h2>
                <p class="panel-subtitle">목표와 연결되지 않은 시간도 확인합니다.</p>
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
              <p class="panel-subtitle">계획, 실행, 체크, 리뷰가 어떻게 이어지는지 빠르게 확인합니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="guide-grid">
              ${renderGuideCard("1", "계획 드래그", "계획 레인 09:00-10:00", "주간 화면의 계획 레인을 클릭한 채 아래로 끌면 계획 시간 라인이 생깁니다.")}
              ${renderGuideCard("2", "실행 드래그", "실행 레인 09:10-09:55", "실행 후 실제로 쓴 시간만 실행 레인에 긋고, 실행 내용을 입력합니다.")}
              ${renderGuideCard("3", "체크박스", "자료 조사, 전화, 운동", "요일별 체크박스를 주간 화면에서 바로 추가하고 제목도 수정할 수 있습니다.")}
              ${renderGuideCard("4", "취소 메모", "취소: 외부 회의로 변경", "계획이 취소되거나 완전히 바뀌면 취소 체크를 켜고 메모를 남깁니다.")}
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">예시 시간표</h2>
              <p class="panel-subtitle">실행을 적으면 이런 식으로 표시됩니다.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="guide-sample">
              <div class="guide-sample-row">
                <div class="timeline-hour">09:00</div>
                <div class="timeline-lane plan-lane">
                  <div class="lane-title">계획</div>
                  <div class="plan-line is-executed" style="border-left-color:#0f766e">
                    <label class="inline-check">
                      <input type="checkbox" checked disabled>
                      <span>09:00-10:00 주간 계획 작성</span>
                    </label>
                  </div>
                </div>
                <div class="timeline-lane actual-lane">
                  <div class="lane-title">실행</div>
                  <input class="actual-input is-executed" value="핵심 목표 3개 정리" disabled>
                </div>
              </div>
              <div class="guide-sample-row">
                <div class="timeline-hour">10:00</div>
                <div class="timeline-lane plan-lane">
                  <div class="lane-title">계획</div>
                  <div class="plan-line" style="border-left-color:#5b57c8">
                    <label class="inline-check">
                      <input type="checkbox" disabled>
                      <span>10:00-11:00 자료 읽기</span>
                    </label>
                  </div>
                </div>
                <div class="timeline-lane actual-lane">
                  <div class="lane-title">실행</div>
                  <input class="actual-input" placeholder="실행한 내용" disabled>
                </div>
              </div>
            </div>
          </div>
        </section>
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
    app.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          draft.activeView = button.dataset.view;
        });
      });
    });

    app.querySelectorAll("[data-date-shift]").forEach((button) => {
      button.addEventListener("click", () => {
        const direction = Number(button.dataset.dateShift);
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
        setState((draft) => {
          draft.currentDate = todayISO();
        });
      });
    }

    const exportButton = app.querySelector("[data-export]");
    if (exportButton) {
      exportButton.addEventListener("click", exportData);
    }

    app.querySelectorAll("[data-select-date]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((draft) => {
          draft.currentDate = button.dataset.selectDate;
          draft.activeView = "week";
        });
      });
    });

    app.querySelectorAll("[data-form]").forEach((form) => {
      form.addEventListener("submit", handleFormSubmit);
    });

    app.querySelectorAll(".task-check").forEach((input) => {
      input.addEventListener("change", () => {
        setState((draft) => {
          const task = draft.tasks.find((item) => item.id === input.dataset.taskId);
          if (task) task.done = input.checked;
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

    app.querySelectorAll(".cancel-check").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          const memo = window.prompt("취소 또는 완전 변경된 이유를 짧게 남겨주세요.", "계획 취소");
          if (memo === null) {
            input.checked = false;
            return;
          }
          setState((draft) => {
            const block = draft.blocks.find((item) => item.id === input.dataset.blockId);
            if (block) {
              block.cancelled = true;
              block.cancelMemo = memo.trim() || "계획 취소";
            }
          });
        } else {
          setState((draft) => {
            const block = draft.blocks.find((item) => item.id === input.dataset.blockId);
            if (block) {
              block.cancelled = false;
              block.cancelMemo = "";
            }
          });
        }
      });
    });

    app.querySelectorAll("[data-open-cancel]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const block = state.blocks.find((item) => item.id === button.dataset.openCancel);
        if (block) window.alert(block.cancelMemo || "취소 메모가 없습니다.");
      });
    });

    app.querySelectorAll("[data-edit-plan]").forEach((segment) => {
      segment.addEventListener("click", (event) => {
        if (event.target.closest("input,label,.cancel-memo,[data-open-cancel]")) return;
        editPlanBlock(segment.dataset.editPlan);
      });
    });

    app.querySelectorAll("[data-edit-actual]").forEach((segment) => {
      segment.addEventListener("click", () => {
        editActualBlock(segment.dataset.editActual);
      });
    });

    app.querySelectorAll(".draw-lane").forEach((lane) => {
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

  function handleBlockPhotoUpload(input) {
    const blockId = input.dataset.blockId;
    const files = Array.from(input.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    Promise.all(files.slice(0, 6).map(readFileAsDataUrl))
      .then((photos) => {
        setState((draft) => {
          const block = draft.blocks.find((item) => item.id === blockId);
          if (block) {
            block.photos = [...(block.photos || []), ...photos].slice(0, 12);
          }
        });
      })
      .catch(() => {
        window.alert("사진을 불러오지 못했습니다.");
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
    const safeEnd = end === start ? Math.min(start + 60, DAY_END_HOUR * 60) : end;
    const top = ((start - DAY_START_HOUR * 60) / ((DAY_END_HOUR - DAY_START_HOUR) * 60)) * 100;
    const height = ((safeEnd - start) / ((DAY_END_HOUR - DAY_START_HOUR) * 60)) * 100;
    drawState.preview.style.top = `${top}%`;
    drawState.preview.style.height = `${Math.max(3.2, height)}%`;
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
    if (end === start) end = Math.min(start + 60, DAY_END_HOUR * 60);
    if (end - start < SNAP_MINUTES) end = Math.min(start + SNAP_MINUTES, DAY_END_HOUR * 60);
    const startTime = timeFromMinutes(start);
    const endTime = timeFromMinutes(end);
    const type = drawState.type;
    const date = drawState.date;
    drawState.preview.remove();
    drawState = null;

    if (type === "plan") {
      const title = window.prompt(`${startTime}-${endTime} 계획 내용을 입력하세요.`, "새 계획");
      if (!title) return;
      setState((draft) => {
        draft.blocks.push({
          id: uid("block"),
          title: title.trim(),
          date,
          start: startTime,
          end: endTime,
          categoryId: "work",
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
        draft.currentDate = date;
      });
      return;
    }

    const actualText = window.prompt(`${startTime}-${endTime} 실행 내용을 입력하세요.`, "실행 기록");
    if (!actualText) return;
    setState((draft) => {
      draft.blocks.push({
        id: uid("block"),
        title: actualText.trim(),
        date,
        start: startTime,
        end: endTime,
        categoryId: "work",
        goalId: "",
        projectId: "",
        status: "actual",
        actualStart: startTime,
        actualEnd: endTime,
        actualText: actualText.trim(),
        actualDone: true,
        actualOnly: true,
        cancelled: false,
        cancelMemo: "",
        memoText: "",
        photos: []
      });
      draft.currentDate = date;
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

  function editPlanBlock(id) {
    const block = state.blocks.find((item) => item.id === id);
    if (!block) return;
    const title = window.prompt("계획 내용을 수정하세요.", block.title);
    if (title === null) return;
    const start = window.prompt("계획 시작 시간을 수정하세요. 예: 09:00", block.start);
    if (start === null) return;
    const end = window.prompt("계획 종료 시간을 수정하세요. 예: 10:30", block.end);
    if (end === null) return;
    setState((draft) => {
      const target = draft.blocks.find((item) => item.id === id);
      if (target) {
        target.title = title.trim() || target.title;
        target.start = normalizeTimeInput(start, target.start);
        target.end = normalizeTimeInput(end, target.end);
      }
    });
  }

  function editActualBlock(id) {
    const block = state.blocks.find((item) => item.id === id);
    if (!block) return;
    const text = window.prompt("실행 내용을 수정하세요.", block.actualText || block.title);
    if (text === null) return;
    const start = window.prompt("실행 시작 시간을 수정하세요. 예: 09:10", block.actualStart || block.start);
    if (start === null) return;
    const end = window.prompt("실행 종료 시간을 수정하세요. 예: 09:55", block.actualEnd || block.end);
    if (end === null) return;
    setState((draft) => {
      const target = draft.blocks.find((item) => item.id === id);
      if (target) {
        target.actualText = text.trim() || target.actualText || target.title;
        target.actualStart = normalizeTimeInput(start, target.actualStart || target.start);
        target.actualEnd = normalizeTimeInput(end, target.actualEnd || target.end);
        target.actualDone = true;
        if (target.actualOnly) {
          target.title = target.actualText;
          target.start = target.actualStart;
          target.end = target.actualEnd;
        }
      }
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

  function toCamel(key) {
    return key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const type = form.dataset.form;
    const data = Object.fromEntries(new FormData(form).entries());

    if (type === "schedule") {
      setState((draft) => {
        draft.blocks.push({
          id: uid("block"),
          title: data.title.trim(),
          date: data.date,
          start: data.start,
          end: data.end,
          categoryId: data.categoryId,
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

    if (type === "task") {
      const project = projectById(data.projectId);
      setState((draft) => {
        draft.tasks.push({
          id: uid("task"),
          title: data.title.trim(),
          projectId: data.projectId || "",
          goalId: project?.goalId || "",
          dueDate: data.dueDate || draft.currentDate,
          priority: "normal",
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
        draft.reviews.weekly[weekStart] = {
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
      text: existing?.text || ""
    };
  }

  function ensureDailyLogMutable(draft, date) {
    if (!draft.reviews.daily[date]) {
      draft.reviews.daily[date] = { top: ["", "", ""], text: "" };
    }
    if (!Array.isArray(draft.reviews.daily[date].top)) {
      draft.reviews.daily[date].top = ["", "", ""];
    }
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

  render();
})();
