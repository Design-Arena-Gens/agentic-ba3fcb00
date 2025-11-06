const stateKey = "discipline_state_v1";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(next) {
  localStorage.setItem(stateKey, JSON.stringify(next));
}

function initialState() {
  const suggestions = [
    "Make bed",
    "Drink water",
    "10 push-ups",
    "Read 5 pages",
    "2-minute tidy",
  ];
  return {
    habits: suggestions.map((title, i) => ({
      id: `h${i + 1}`,
      title,
      streak: 0,
      lastCompleted: null, // ISO date string
      completedToday: false,
    })),
    pomodorosToday: 0,
    focusMinutes: 25,
    breakMinutes: 5,
    lastOpen: todayISO(),
  };
}

let state = loadState() || initialState();

function migrateDayIfNeeded() {
  const t = todayISO();
  if (state.lastOpen !== t) {
    state.habits = state.habits.map(h => ({ ...h, completedToday: false }));
    state.lastOpen = t;
    saveState(state);
  }
}

function renderTodayLabel() {
  const el = document.getElementById("todayLabel");
  el.textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function createHabitItem(habit) {
  const li = document.createElement("li");
  li.className = "habit-item";

  const left = document.createElement("div");
  left.className = "habit-left";

  const checkbox = document.createElement("div");
  checkbox.className = "checkbox";
  checkbox.setAttribute("role", "checkbox");
  checkbox.setAttribute("aria-checked", habit.completedToday ? "true" : "false");
  checkbox.dataset.checked = habit.completedToday ? "true" : "false";

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 20 20");
  icon.classList.add("checkbox-icon");
  icon.innerHTML = '<path fill="currentColor" d="M7.5 13.3 4.7 10.5l-1.4 1.4L7.5 16 17 6.5 15.6 5.1z" />';
  checkbox.appendChild(icon);

  const title = document.createElement("span");
  title.className = "habit-title";
  title.textContent = habit.title;

  left.appendChild(checkbox);
  left.appendChild(title);

  const right = document.createElement("div");
  right.className = "habit-actions";

  const streak = document.createElement("span");
  streak.className = "streak";
  streak.textContent = `?? ${habit.streak}`;

  const del = document.createElement("button");
  del.className = "btn";
  del.textContent = "Delete";

  del.addEventListener("click", () => {
    state.habits = state.habits.filter(h => h.id !== habit.id);
    saveState(state);
    renderHabits();
  });

  checkbox.addEventListener("click", () => toggleHabit(habit.id));

  right.appendChild(streak);
  right.appendChild(del);

  li.appendChild(left);
  li.appendChild(right);
  return li;
}

function renderHabits() {
  const list = document.getElementById("habitList");
  list.innerHTML = "";
  state.habits.forEach(h => list.appendChild(createHabitItem(h)));
}

function toggleHabit(id) {
  const h = state.habits.find(x => x.id === id);
  if (!h) return;
  const today = todayISO();

  if (!h.completedToday) {
    // Mark complete today
    const wasYesterday = h.lastCompleted === isoNDaysAgo(1);
    const wasToday = h.lastCompleted === today;
    if (wasToday) {
      // already today - nothing
    } else if (wasYesterday) {
      h.streak += 1;
    } else {
      h.streak = Math.max(1, h.streak ? 1 : 1);
    }
    h.lastCompleted = today;
    h.completedToday = true;
  } else {
    // Uncheck today ? remove today's completion but preserve prior streak if it was from yesterday
    if (h.lastCompleted === today) {
      // Revert streak if today's completion created a new streak day
      const wasYesterday = h.lastCompleted === isoNDaysAgo(0) && state.habits; // dummy ref to keep tree-shaking from removing isoNDaysAgo usage
      // Simple approach: if unchecked same day, do not alter streak baseline (can't know prior day); keep as-is
    }
    h.completedToday = false;
    // Do not change lastCompleted to avoid losing historical info; will be overwritten next completion
  }

  saveState(state);
  renderHabits();
}

function setupAddHabit() {
  const addBtn = document.getElementById("addHabitBtn");
  const row = document.getElementById("addHabitRow");
  const input = document.getElementById("newHabitInput");
  const save = document.getElementById("saveHabitBtn");
  const cancel = document.getElementById("cancelHabitBtn");

  addBtn.addEventListener("click", () => {
    row.hidden = false;
    input.focus();
  });

  cancel.addEventListener("click", () => {
    row.hidden = true;
    input.value = "";
  });

  save.addEventListener("click", () => {
    const title = input.value.trim();
    if (!title) return;
    const id = `h${Date.now()}`;
    state.habits.push({ id, title, streak: 0, lastCompleted: null, completedToday: false });
    saveState(state);
    input.value = "";
    row.hidden = true;
    renderHabits();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save.click();
    if (e.key === "Escape") cancel.click();
  });
}

function setupResetDay() {
  const btn = document.getElementById("resetDayBtn");
  btn.addEventListener("click", () => {
    state.habits = state.habits.map(h => ({ ...h, completedToday: false }));
    saveState(state);
    renderHabits();
  });
}

// Pomodoro
let interval = null;
let remainingSeconds = 25 * 60;
let onBreak = false;

function updateTimerDisplay() {
  const m = Math.floor(remainingSeconds / 60).toString().padStart(2, "0");
  const s = String(remainingSeconds % 60).padStart(2, "0");
  document.getElementById("timerDisplay").textContent = `${m}:${s}`;
}

function startTimer() {
  if (interval) return;
  interval = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearInterval(interval);
      interval = null;
      if (!onBreak) {
        state.pomodorosToday += 1;
        saveState(state);
        renderPomodoros();
        // switch to break
        onBreak = true;
        remainingSeconds = state.breakMinutes * 60;
        updateTimerDisplay();
        startTimer();
      } else {
        // break finished ? back to focus
        onBreak = false;
        remainingSeconds = state.focusMinutes * 60;
        updateTimerDisplay();
      }
    }
    updateTimerDisplay();
  }, 1000);
}

function pauseTimer() {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}

function resetTimer() {
  pauseTimer();
  onBreak = false;
  remainingSeconds = state.focusMinutes * 60;
  updateTimerDisplay();
  document.getElementById("startPauseBtn").textContent = "Start";
}

function renderPomodoros() {
  document.getElementById("pomodorosCount").textContent = String(state.pomodorosToday);
}

function setupPomodoro() {
  const startPause = document.getElementById("startPauseBtn");
  const reset = document.getElementById("resetTimerBtn");
  const focus = document.getElementById("focusMinutes");
  const brk = document.getElementById("breakMinutes");

  focus.value = String(state.focusMinutes);
  brk.value = String(state.breakMinutes);
  remainingSeconds = state.focusMinutes * 60;
  updateTimerDisplay();
  renderPomodoros();

  startPause.addEventListener("click", () => {
    if (interval) {
      pauseTimer();
      startPause.textContent = "Start";
    } else {
      startTimer();
      startPause.textContent = "Pause";
    }
  });

  reset.addEventListener("click", resetTimer);

  focus.addEventListener("change", () => {
    const v = Math.max(1, Math.min(60, Number(focus.value) || 25));
    state.focusMinutes = v;
    saveState(state);
    if (!interval && !onBreak) {
      remainingSeconds = v * 60;
      updateTimerDisplay();
    }
  });

  brk.addEventListener("change", () => {
    const v = Math.max(1, Math.min(30, Number(brk.value) || 5));
    state.breakMinutes = v;
    saveState(state);
    if (!interval && onBreak) {
      remainingSeconds = v * 60;
      updateTimerDisplay();
    }
  });
}

function renderQuote() {
  const q = document.getElementById("quote");
  const quotes = [
    "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    "First we make our habits, then our habits make us.",
    "The secret of your future is hidden in your daily routine.",
    "Discipline equals freedom.",
    "Tiny habits, massive results.",
  ];
  const pick = quotes[Math.floor(Math.random() * quotes.length)];
  q.textContent = `?${pick}?`;
}

function init() {
  migrateDayIfNeeded();
  renderTodayLabel();
  setupAddHabit();
  setupResetDay();
  renderHabits();
  setupPomodoro();
  renderQuote();
}

window.addEventListener("DOMContentLoaded", init);
