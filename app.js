import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DAYS, scheduleForDay, logId } from "./schedule.js";

const SUPABASE_URL = "https://incwfwmaklcvsurstcnx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Or7BTTba9cdizCAKaq5G0g_gMGLutJF";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const TABLE = "homework_log";

// ---------- date helpers ----------

function pad2(n) { return String(n).padStart(2, "0"); }

function dateStrOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function dayAbbrOf(date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
}

function mondayOf(date) {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekDatesOf(anchor) {
  const monday = mondayOf(anchor);
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// ---------- state ----------

const today = new Date();
const TODAY_STR = dateStrOf(today);

let view = "day"; // "day" | "week"
let selectedDate = new Date(today);
const logsCache = new Map(); // dateStr -> Map(id -> row)

// ---------- dom refs ----------

const bannerEl = document.getElementById("banner");
const bannerTextEl = document.getElementById("bannerText");
const appTitleEl = document.getElementById("appTitle");
const appSubtitleEl = document.getElementById("appSubtitle");
const dayViewBtn = document.getElementById("dayViewBtn");
const weekViewBtn = document.getElementById("weekViewBtn");
const dayTabsEl = document.getElementById("dayTabs");
const scheduleListEl = document.getElementById("scheduleList");
const weekViewEl = document.getElementById("weekView");
const confettiLayerEl = document.getElementById("confettiLayer");
const toastEl = document.getElementById("toast");

// ---------- data access ----------

function defaultRowFor(item, dateStr) {
  return {
    id: logId(dateStr, item),
    date: dateStr,
    day: item.day,
    item: item.label,
    scheduled_start: `${item.start_time}:00`,
    duration_minutes: item.duration_minutes,
    completed: false,
    completed_at: null,
    elapsed_seconds: 0,
    timer_state: "idle",
    timer_started_at: null,
    timer_events: [],
  };
}

function cacheGet(dateStr, id) {
  return logsCache.get(dateStr)?.get(id) || null;
}

function cacheSet(row) {
  if (!logsCache.has(row.date)) logsCache.set(row.date, new Map());
  logsCache.get(row.date).set(row.id, row);
}

async function fetchLogsForDates(dateStrs) {
  const { data, error } = await supabase.from(TABLE).select("*").in("date", dateStrs);
  if (error) {
    showToast("Couldn't load schedule log — check connection");
    console.error(error);
    return;
  }
  for (const ds of dateStrs) if (!logsCache.has(ds)) logsCache.set(ds, new Map());
  for (const row of data) cacheSet(row);
}

async function upsertLog(item, dateStr, patch) {
  const base = cacheGet(dateStr, logId(dateStr, item)) || defaultRowFor(item, dateStr);
  const merged = { ...base, ...patch, updated_at: new Date().toISOString() };
  cacheSet(merged); // optimistic
  renderAll();
  const { data, error } = await supabase.from(TABLE).upsert(merged, { onConflict: "id" }).select().single();
  if (error) {
    showToast("Sync failed — will retry on next change");
    console.error(error);
    return;
  }
  cacheSet(data);
  renderAll();
}

// ---------- timer math ----------

function liveElapsedSeconds(row) {
  if (!row) return 0;
  if (row.timer_state === "running" && row.timer_started_at) {
    const base = row.elapsed_seconds || 0;
    const running = Math.floor((Date.now() - new Date(row.timer_started_at).getTime()) / 1000);
    return base + Math.max(0, running);
  }
  return row.elapsed_seconds || 0;
}

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function pushEvent(row, action) {
  const events = Array.isArray(row.timer_events) ? row.timer_events.slice() : [];
  events.push({ action, at: new Date().toISOString() });
  return events;
}

function startTimer(item, dateStr) {
  const row = cacheGet(dateStr, logId(dateStr, item)) || defaultRowFor(item, dateStr);
  if (row.timer_state === "running") return;
  upsertLog(item, dateStr, {
    timer_state: "running",
    timer_started_at: new Date().toISOString(),
    timer_events: pushEvent(row, "start"),
  });
}

function pauseTimer(item, dateStr) {
  const row = cacheGet(dateStr, logId(dateStr, item)) || defaultRowFor(item, dateStr);
  if (row.timer_state !== "running") return;
  upsertLog(item, dateStr, {
    elapsed_seconds: liveElapsedSeconds(row),
    timer_state: "paused",
    timer_started_at: null,
    timer_events: pushEvent(row, "pause"),
  });
}

function resetTimer(item, dateStr) {
  const row = cacheGet(dateStr, logId(dateStr, item)) || defaultRowFor(item, dateStr);
  upsertLog(item, dateStr, {
    elapsed_seconds: 0,
    timer_state: "idle",
    timer_started_at: null,
    timer_events: pushEvent(row, "reset"),
  });
}

function toggleComplete(item, dateStr, cardEl) {
  const row = cacheGet(dateStr, logId(dateStr, item)) || defaultRowFor(item, dateStr);
  const nowComplete = !row.completed;
  const patch = { completed: nowComplete, completed_at: nowComplete ? new Date().toISOString() : null };
  if (nowComplete && row.timer_state === "running") {
    patch.elapsed_seconds = liveElapsedSeconds(row);
    patch.timer_state = "paused";
    patch.timer_started_at = null;
    patch.timer_events = pushEvent(row, "pause");
  }
  if (nowComplete) {
    const btn = cardEl?.querySelector(".check-btn");
    if (btn) {
      btn.classList.remove("pop");
      void btn.offsetWidth;
      btn.classList.add("pop");
    }
    burstConfetti(cardEl);
  }
  upsertLog(item, dateStr, patch);
}

// ---------- banner ----------

function homeworkStatusForDate(dateStr) {
  const items = scheduleForDay(dayAbbrOf(new Date(dateStr + "T00:00:00"))).filter((i) => i.type === "homework");
  if (items.length === 0) return { total: 0, done: 0, allComplete: true };
  const dayMap = logsCache.get(dateStr);
  const done = items.filter((i) => dayMap?.get(logId(dateStr, i))?.completed).length;
  return { total: items.length, done, allComplete: done === items.length };
}

function updateBanner() {
  const status = homeworkStatusForDate(TODAY_STR);
  if (status.allComplete) {
    bannerEl.classList.remove("banner-incomplete");
    bannerEl.classList.add("banner-complete");
    bannerTextEl.textContent = status.total === 0 ? "No Homework Today — Cleared to Drive" : "Cleared to Drive";
  } else {
    bannerEl.classList.remove("banner-complete");
    bannerEl.classList.add("banner-incomplete");
    bannerTextEl.textContent = `Incomplete = No Driving (${status.done}/${status.total})`;
  }
}

// ---------- rendering: day view ----------

function itemCardHTML(item, dateStr) {
  const row = cacheGet(dateStr, logId(dateStr, item));
  const isHomework = item.type === "homework";
  const complete = !!row?.completed;
  const elapsed = liveElapsedSeconds(row);
  const timerState = row?.timer_state || "idle";

  const controls = isHomework
    ? `
      <div class="item-controls" data-role="controls">
        <button class="timer-btn ${timerState === "running" ? "running" : ""}" data-action="timer-toggle" aria-label="Start or pause timer">
          ${timerState === "running" ? "⏸" : "▶"}
        </button>
        <button class="timer-btn" data-action="timer-reset" aria-label="Reset timer">↺</button>
        <button class="check-btn ${complete ? "checked" : ""}" data-action="toggle-complete" aria-label="Mark done">✓</button>
      </div>`
    : "";

  const targetSeconds = (item.expected_minutes || 0) * 60;
  const goalMet = elapsed >= targetSeconds && targetSeconds > 0;
  const timerInfo = isHomework
    ? `
      <div class="timer-info">
        <span class="timer-stat">
          <span class="timer-stat-label">Elapsed</span>
          <span class="timer-stat-value ${goalMet ? "goal-met" : ""}" data-role="readout" data-timer-state="${timerState}" data-elapsed-base="${row?.elapsed_seconds || 0}" data-started-at="${row?.timer_started_at || ""}" data-target-seconds="${targetSeconds}">${formatMMSS(elapsed)}</span>
        </span>
        <span class="timer-stat">
          <span class="timer-stat-label">Target</span>
          <span class="timer-stat-value timer-stat-target">${formatMMSS(targetSeconds)}</span>
        </span>
      </div>`
    : "";

  return `
    <article class="item-card type-${item.type} ${complete ? "is-complete" : ""}" data-item-key="${item.item_key}">
      <div class="item-time">${item.start_time}</div>
      <div class="item-body">
        <p class="item-label">${item.label}</p>
        <div class="item-meta">
          <span class="type-pill">${item.type}</span>
        </div>
        ${timerInfo}
      </div>
      ${controls}
    </article>`;
}

function renderDay() {
  const dateStr = dateStrOf(selectedDate);
  const dayAbbr = dayAbbrOf(selectedDate);
  const items = scheduleForDay(dayAbbr);
  scheduleListEl.innerHTML = items.map((item) => itemCardHTML(item, dateStr)).join("");
}

function renderDayTabs() {
  const weekDates = weekDatesOf(selectedDate);
  dayTabsEl.innerHTML = weekDates
    .map((d, i) => {
      const abbr = DAYS[i];
      const isSelected = dateStrOf(d) === dateStrOf(selectedDate);
      const isToday = dateStrOf(d) === TODAY_STR;
      return `<button class="day-tab ${isSelected ? "active" : ""} ${isToday ? "is-today" : ""}" data-date="${dateStrOf(d)}">${abbr}</button>`;
    })
    .join("");
}

// ---------- rendering: week view ----------

function weekCardHTML(date) {
  const dateStr = dateStrOf(date);
  const abbr = dayAbbrOf(date);
  const status = homeworkStatusForDate(dateStr);
  const pct = status.total === 0 ? 100 : Math.round((status.done / status.total) * 100);
  const isToday = dateStr === TODAY_STR;
  return `
    <article class="week-card ${isToday ? "is-today" : ""}" data-date="${dateStr}">
      <h3>${abbr}</h3>
      <div class="week-ring" style="--pct:${pct}"><span>${pct}%</span></div>
      <p class="week-sub">${status.total === 0 ? "No homework" : `${status.done}/${status.total} done`}</p>
    </article>`;
}

async function renderWeek() {
  const weekDates = weekDatesOf(selectedDate);
  const dateStrs = weekDates.map(dateStrOf);
  await fetchLogsForDates(dateStrs);
  weekViewEl.innerHTML = weekDates.map(weekCardHTML).join("");
}

function renderAll() {
  renderDayTabs();
  updateBanner();
  if (view === "day") renderDay();
  else renderWeek();
}

// ---------- confetti ----------

const CONFETTI_COLORS = ["#3fd0ff", "#b6ff3f", "#b06bff", "#ffcc33", "#ff5f9e"];

function burstConfetti(originEl) {
  const rect = originEl?.getBoundingClientRect?.() || { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0 };
  const originX = rect.left + rect.width / 2;
  const count = 22;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const drift = (Math.random() - 0.5) * 160;
    const duration = 900 + Math.random() * 700;
    piece.style.left = `${originX + (Math.random() - 0.5) * 40}px`;
    piece.style.top = `${rect.top}px`;
    piece.style.background = color;
    piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    piece.style.setProperty("--drift", `${drift}px`);
    piece.style.animationDuration = `${duration}ms`;
    piece.style.transform = `translateX(0)`;
    piece.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${drift}px, 100vh) rotate(${600 + Math.random() * 400}deg)`, opacity: 0 },
      ],
      { duration, easing: "cubic-bezier(.25,.46,.45,.94)", fill: "forwards" }
    );
    confettiLayerEl.appendChild(piece);
    setTimeout(() => piece.remove(), duration + 50);
  }
}

// ---------- toast ----------

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 3200);
}

// ---------- header ----------

function renderHeader() {
  appTitleEl.textContent = view === "day" ? "Jake's Day" : "Jake's Week";
  const opts = { weekday: "long", month: "short", day: "numeric" };
  appSubtitleEl.textContent =
    view === "day" ? selectedDate.toLocaleDateString(undefined, opts) : "Week overview";
}

// ---------- event wiring ----------

dayViewBtn.addEventListener("click", () => {
  view = "day";
  dayViewBtn.classList.add("active");
  weekViewBtn.classList.remove("active");
  dayViewBtn.setAttribute("aria-selected", "true");
  weekViewBtn.setAttribute("aria-selected", "false");
  scheduleListEl.classList.remove("hidden");
  weekViewEl.classList.add("hidden");
  renderHeader();
  ensureDatesLoaded([dateStrOf(selectedDate)]).then(renderAll);
});

weekViewBtn.addEventListener("click", () => {
  view = "week";
  weekViewBtn.classList.add("active");
  dayViewBtn.classList.remove("active");
  weekViewBtn.setAttribute("aria-selected", "true");
  dayViewBtn.setAttribute("aria-selected", "false");
  weekViewEl.classList.remove("hidden");
  scheduleListEl.classList.add("hidden");
  renderHeader();
  renderWeek();
  renderDayTabs();
  updateBanner();
});

dayTabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".day-tab");
  if (!btn) return;
  selectedDate = new Date(btn.dataset.date + "T00:00:00");
  renderHeader();
  ensureDatesLoaded([dateStrOf(selectedDate)]).then(renderAll);
});

scheduleListEl.addEventListener("click", (e) => {
  const card = e.target.closest(".item-card");
  const actionBtn = e.target.closest("[data-action]");
  if (!card || !actionBtn) return;
  const dateStr = dateStrOf(selectedDate);
  const item = scheduleForDay(dayAbbrOf(selectedDate)).find((i) => i.item_key === card.dataset.itemKey);
  if (!item) return;
  const action = actionBtn.dataset.action;
  if (action === "timer-toggle") {
    const row = cacheGet(dateStr, logId(dateStr, item));
    if (row?.timer_state === "running") pauseTimer(item, dateStr);
    else startTimer(item, dateStr);
  } else if (action === "timer-reset") {
    resetTimer(item, dateStr);
  } else if (action === "toggle-complete") {
    toggleComplete(item, dateStr, card);
  }
});

weekViewEl.addEventListener("click", (e) => {
  const card = e.target.closest(".week-card");
  if (!card) return;
  selectedDate = new Date(card.dataset.date + "T00:00:00");
  view = "day";
  dayViewBtn.classList.add("active");
  weekViewBtn.classList.remove("active");
  scheduleListEl.classList.remove("hidden");
  weekViewEl.classList.add("hidden");
  renderHeader();
  ensureDatesLoaded([dateStrOf(selectedDate)]).then(renderAll);
});

// ---------- live timer tick (display only, no writes) ----------

setInterval(() => {
  document.querySelectorAll('.timer-stat-value[data-timer-state="running"]').forEach((el) => {
    const base = Number(el.dataset.elapsedBase || 0);
    const startedAt = el.dataset.startedAt;
    if (!startedAt) return;
    const running = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    const elapsed = base + running;
    el.textContent = formatMMSS(elapsed);
    const target = Number(el.dataset.targetSeconds || 0);
    el.classList.toggle("goal-met", target > 0 && elapsed >= target);
  });
}, 1000);

// ---------- midnight rollover check ----------

setInterval(() => {
  if (dateStrOf(new Date()) !== TODAY_STR) {
    window.location.reload();
  }
}, 60000);

// ---------- realtime sync ----------

supabase
  .channel("homework_log-changes")
  .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, (payload) => {
    const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    if (!row) return;
    if (payload.eventType === "DELETE") {
      logsCache.get(row.date)?.delete(row.id);
    } else {
      cacheSet(payload.new);
    }
    renderAll();
  })
  .subscribe();

// ---------- init ----------

async function ensureDatesLoaded(dateStrs) {
  const missing = dateStrs.filter((ds) => !logsCache.has(ds));
  if (missing.length) await fetchLogsForDates(missing);
}

async function init() {
  renderHeader();
  renderDayTabs();
  await ensureDatesLoaded([TODAY_STR, dateStrOf(selectedDate)]);
  renderAll();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
