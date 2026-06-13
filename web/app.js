let sessionId = "web-" + Math.random().toString(36).slice(2);
let chartSeq = 0;
let busy = false;

const AGENTS = [
  { key: "planner", label: "Планировщик" },
  { key: "extractor", label: "Извлечение" },
  { key: "analyst", label: "Аналитик" },
  { key: "critic", label: "Критик" },
  { key: "visualizer", label: "Визуализация" },
];
const SUGGESTIONS = [
  "Здоров ли бизнес в целом?",
  "Почему выручка падает, а GMV растёт?",
  "Каковы три главных риска?",
  "LTV/CAC по сегментам — где привлечение убыточно?",
  "Где у нас самый низкий NPS?",
];
const FOLLOWUPS = ["В динамике по годам", "Разбей по сегментам", "Сравни продуктовые линии", "Что с этим делать?"];

// --- История чатов (localStorage) ---
const LS_KEY = "meridian_chats_v1";
let chats = [];      // [{id, title, ts, msgs:[{role:'user',text} | {role:'bot',r}]}]
let activeId = sessionId;
function loadChats() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } }
function saveChats() { try { localStorage.setItem(LS_KEY, JSON.stringify(chats.slice(0, 40))); } catch {} }
function saveActive() { try { localStorage.setItem(LS_KEY + "_active", activeId || ""); } catch {} }
function activeChat() { return chats.find((c) => c.id === activeId); }

function pushUser(text) {
  let c = activeChat();
  if (!c) { c = { id: sessionId, title: text.slice(0, 42), ts: Date.now(), msgs: [] }; chats.unshift(c); activeId = sessionId; saveActive(); }
  if (!c.title) c.title = text.slice(0, 42);
  c.msgs.push({ role: "user", text }); c.ts = Date.now();
  saveChats(); renderSidebar();
}
function pushBot(r) { const c = activeChat(); if (!c) return; c.msgs.push({ role: "bot", r }); saveChats(); }

function showWelcome() {
  log.innerHTML = "";
  const w = el("div", "welcome");
  w.id = "welcome";
  w.innerHTML = '<div class="mark">M</div><h2>Спросите про бизнес Meridian</h2>'
    + '<p>Задайте вопрос на естественном языке — система сама решит, ответить кратко или провести мини-исследование. Вот с чего можно начать:</p>'
    + '<div class="suggest" id="suggest"></div>';
  log.appendChild(w);
  renderSuggestions();
}
function renderChat(chat) {
  log.innerHTML = "";
  if (!chat || !chat.msgs.length) { showWelcome(); return; }
  chat.msgs.forEach((m) => {
    if (m.role === "user") userMsg(m.text);
    else { const node = el("div", "msg bot"); log.appendChild(node); botAnswer(node, m.r); }
  });
  scroll();
}
function renderSidebar() {
  const list = document.getElementById("chat-list");
  if (!list) return;
  list.innerHTML = "";
  if (!chats.length) { list.appendChild(el("div", "side-empty", "Пока нет истории")); return; }
  chats.forEach((c) => {
    const item = el("div", "side-item" + (c.id === activeId ? " active" : ""));
    item.appendChild(el("span", "side-title", esc(c.title || "Новый чат")));
    const del = el("button", "side-del", svg("trash", 13));
    del.title = "Удалить";
    del.onclick = (e) => {
      e.stopPropagation();
      chats = chats.filter((x) => x.id !== c.id); saveChats();
      if (activeId === c.id) newChat(); else renderSidebar();
    };
    item.appendChild(del);
    item.onclick = () => loadChat(c.id);
    list.appendChild(item);
  });
}
function loadChat(id) { activeId = id; sessionId = id; saveActive(); renderChat(activeChat()); renderSidebar(); closeSidebar(); }
function newChat() {
  sessionId = "web-" + Math.random().toString(36).slice(2);
  activeId = sessionId; saveActive();
  showWelcome(); renderSidebar(); closeSidebar();
}
function closeSidebar() { document.body.classList.remove("sidebar-open"); }

const log = document.getElementById("log");
const thread = document.getElementById("thread");
const input = document.getElementById("input");

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const scroll = () => { thread.scrollTop = thread.scrollHeight; };

// inline-SVG иконки (stroke, currentColor) — в стиле сайта
const ICONS = {
  research: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  code: '<path d="m16 18 4-4-4-4M8 6l-4 4 4 4"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
};
const svg = (n, sz = 14) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${ICONS[n] || ""}</svg>`;

// --- мини-markdown: абзацы по пустым строкам, **жирный**, `код`, списки ---
function md(text) {
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  const blocks = String(text).replace(/\r/g, "").split(/\n{2,}/);
  const out = [];
  for (const blk of blocks) {
    const lines = blk.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^[-•]\s+/.test(l)))
      out.push("<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^[-•]\s+/, "")) + "</li>").join("") + "</ul>");
    else if (lines.every((l) => /^\d+[.)]\s+/.test(l)))
      out.push("<ol>" + lines.map((l) => "<li>" + inline(l.replace(/^\d+[.)]\s+/, "")) + "</li>").join("") + "</ol>");
    else out.push("<p>" + lines.map(inline).join("<br>") + "</p>");
  }
  return out.join("");
}

const RU_MON = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
// Подписи-даты в человеческий вид: 2023-01-01 → «янв 23», 2024-07 → «июл 24».
function fmtLabel(s) {
  // даты могут приходить с временем (2023-01-01 00:00:00 / ISO с T) — срезаем его
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?$/.exec(s);
  if (m) return RU_MON[+m[2] - 1] + " " + m[1].slice(2);
  return s;
}
// Числа на осях/в подсказках для C-level: млрд/млн/тыс, проценты, запятая-десятичная.
function fmtNum(v, pct) {
  if (v == null || isNaN(v)) return "";
  if (pct) return String(Math.round(v * 100) / 100).replace(".", ",") + "%";
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1).replace(".", ",") + " млрд";
  if (a >= 1e6) return Math.round(v / 1e6).toString() + " млн";
  if (a >= 1e3) return Math.round(v / 1e3).toString() + " тыс";
  return String(Math.round(v * 100) / 100).replace(".", ",");
}
function renderChart(parent, chart) {
  if (!chart || !chart.data || !chart.data.length) return;
  const wrap = el("div", "chart-wrap");
  const canvas = document.createElement("canvas");
  canvas.id = "c" + chartSeq++;
  wrap.appendChild(canvas); parent.appendChild(wrap);
  const x = chart.x, y = Array.isArray(chart.y) ? chart.y[0] : chart.y;
  const labels = chart.data.map((r) => fmtLabel(String(r[x])));
  const values = chart.data.map((r) => Number(r[y]));
  const type = ["line", "bar", "pie", "scatter"].includes(chart.type) ? chart.type : "bar";
  const isPct = /pct|rate|margin|доля|процент/i.test(String(y));
  const palette = ["#5d56c4", "#1d9e75", "#e24b4a", "#ba7517", "#378add", "#7f77dd", "#d4537e"];
  const fmt = (v) => fmtNum(v, isPct);
  new Chart(canvas, {
    type,
    data: { labels, datasets: [{ label: chart.title || y, data: values, backgroundColor: type === "pie" ? palette : "#5d56c4", borderColor: "#5d56c4", borderWidth: type === "line" ? 2 : 0, tension: .3 }] },
    options: {
      plugins: {
        legend: { display: type === "pie" },
        title: { display: !!chart.title, text: chart.title, color: "#6c6f76", font: { size: 12 } },
        tooltip: { callbacks: { label: (c) => (type === "pie" ? c.label + ": " : "") + fmt(type === "pie" ? c.parsed : c.parsed.y) } },
      },
      scales: type === "pie" ? {} : { y: { beginAtZero: true, ticks: { callback: (v) => fmt(v) } } },
      responsive: true, maintainAspectRatio: true,
    },
  });
}

function userMsg(text) {
  const m = el("div", "msg user");
  m.appendChild(el("div", "bubble-user", esc(text)));
  log.appendChild(m); scroll();
}

// «Думаю» с анимацией агентов; возвращает узел для замены
function thinkingMsg() {
  const m = el("div", "msg bot");
  const agents = el("div", "agents");
  AGENTS.forEach((a) => { const p = el("span", "apill", a.label); p.dataset.k = a.key; agents.appendChild(p); });
  const loader = el("div", "loader", '<span class="dot"></span><span class="dot"></span><span class="dot"></span> думаю…');
  m.appendChild(agents); m.appendChild(loader);
  log.appendChild(m); scroll();
  let i = 0;
  const pills = [...agents.querySelectorAll(".apill")];
  const timer = setInterval(() => { pills.forEach((p, idx) => p.classList.toggle("on", idx <= i % pills.length)); i++; }, 420);
  m._timer = timer;
  return m;
}

function copy(text) { navigator.clipboard && navigator.clipboard.writeText(text); }

// Пошаговая трасса агентов (как в транскрипте): роль + что сделал + вердикт + SQL + петля Critic.
const TRACE_ROLE = {
  planner: ["Planner", "режим обработки и декомпозиция"],
  extractor: ["Extractor", "вопрос → SQL → DuckDB"],
  analyst: ["Analyst", "цифры → бизнес-вывод"],
  critic: ["Critic", "проверка по чек-листу ловушек"],
  visualizer: ["Visualization", "выбор графика"],
};
function traceHtml(r) {
  const t = r.trace || [];
  const chain = t.map((x) => x.agent + (x.verdict ? "(" + x.verdict + ")" : "")).join(" → ");
  let critN = 0;
  const steps = t.map((x) => {
    const role = TRACE_ROLE[x.agent] || [x.agent, ""];
    let d = "";
    if (x.agent === "planner") d = "режим: <b>" + esc(r.plan && r.plan.mode || x.note || "—") + "</b>" + (r.plan && r.plan.sub_questions && r.plan.sub_questions.length > 1 ? " · " + r.plan.sub_questions.length + " под-вопроса" : "");
    else if (x.agent === "extractor") d = (x.rows != null ? "<b>" + x.rows + "</b> строк" : "") + (x.sql ? '<pre class="trace-sql">' + esc(x.sql.trim()) + "</pre>" : "");
    else if (x.agent === "analyst") d = esc(x.note || "");
    else if (x.agent === "critic") { critN++; d = '<span class="vbadge v-' + esc(x.verdict || "") + '">' + esc(x.verdict || "") + "</span>" + (critN > 1 ? ' <span class="trace-loop">↻ повторная проверка (петля)</span>' : ""); }
    else if (x.agent === "visualizer") d = "график: <b>" + esc(x.note || "—") + "</b>";
    return '<div class="trace-step"><div class="trace-role"><b>' + role[0] + '</b><span>' + role[1] + '</span></div><div class="trace-detail">' + d + "</div></div>";
  }).join("");
  return '<div class="trace-chain">' + esc(chain) + "</div>" + steps;
}

function botAnswer(node, r) {
  clearInterval(node._timer);
  node.innerHTML = "";
  const isResearch = r.plan && r.plan.mode === "research";
  const ran = [...new Set((r.trace || []).map((t) => t.agent))];

  // пилюли-агенты + режим
  const agents = el("div", "agents");
  const modePill = el("span", "apill mode", svg(isResearch ? "research" : "message", 12) + "<span>" + (isResearch ? "Исследование" : "BI") + "</span>");
  agents.appendChild(modePill);
  AGENTS.filter((a) => ran.includes(a.key)).forEach((a) => agents.appendChild(el("span", "apill on", a.label)));
  node.appendChild(agents);

  const ans = el("div", "answer" + (r.insufficient_data ? " insufficient" : ""));
  if (r.insufficient_data) ans.appendChild(el("div", "ins-tag", svg("alert", 15) + "<span>Данных недостаточно</span>"));

  // декомпозиция research
  if (isResearch && r.plan.sub_questions && r.plan.sub_questions.length > 1) {
    const box = el("div", "research", "<b>Мини-исследование</b> — система разложила вопрос по " + r.plan.sub_questions.length + " направлениям:");
    r.plan.sub_questions.forEach((s, i) => box.appendChild(el("div", "subq", (i + 1) + ". " + esc(s))));
    ans.appendChild(box);
  }

  ans.appendChild(el("div", null, md(r.response)));
  renderChart(ans, r.chart);

  // действия
  const sql = (r.trace || []).find((t) => t.sql)?.sql;
  const meta = el("div", "meta");
  if (r.assumptions && r.assumptions.length) meta.appendChild(toggleBtn(svg("bulb", 13) + "Допущения (" + r.assumptions.length + ")", r.assumptions.map((a) => '<div class="d-item">• ' + esc(a) + "</div>").join("")));
  if (r.trace && r.trace.length) meta.appendChild(toggleBtn(svg("list", 13) + "Трасса агентов", '<div class="trace-box">' + traceHtml(r) + "</div>"));
  const cp = el("button", null, svg("copy", 13) + "Копировать"); cp.onclick = () => copy(r.response); meta.appendChild(cp);
  if (sql) { const sb = el("button", null, svg("code", 13) + "SQL"); sb.onclick = () => copy(sql); meta.appendChild(sb); }
  ans.appendChild(meta);
  node.appendChild(ans);

  // follow-up чипы
  if (!r.insufficient_data) {
    const fu = el("div", "followups");
    FOLLOWUPS.forEach((f) => { const c = el("button", "fchip", f); c.onclick = () => sendText(f); fu.appendChild(c); });
    node.appendChild(fu);
  }
  scroll();
}

function toggleBtn(label, html) {
  const b = el("button", null, label);
  let open = false, box = null;
  b.onclick = () => {
    open = !open;
    if (open) { box = el("div", "disclosure", html); b.after(box); }
    else if (box) { box.remove(); box = null; }
  };
  return b;
}

async function sendText(text) {
  const q = (text ?? "").trim();
  if (!q || busy) return;
  busy = true; updateSend();
  const w = document.getElementById("welcome"); if (w) w.remove();
  userMsg(q);
  pushUser(q);
  input.value = ""; autogrow();
  const node = thinkingMsg();
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: q, session_id: sessionId }),
    });
    const r = await res.json();
    botAnswer(node, r);
    pushBot(r);
  } catch {
    clearInterval(node._timer);
    node.innerHTML = '<div class="answer insufficient">Не удалось получить ответ. Попробуйте ещё раз.</div>';
  } finally { busy = false; updateSend(); }
}

function updateSend() { document.getElementById("send").disabled = busy || !input.value.trim(); }
function autogrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 180) + "px"; }

// --- инициализация ---
function renderSuggestions() {
  const s = document.getElementById("suggest");
  if (!s) return;
  SUGGESTIONS.forEach((q) => { const c = el("button", "chip", q); c.onclick = () => sendText(q); s.appendChild(c); });
}
document.getElementById("send").onclick = () => sendText(input.value);
input.addEventListener("input", () => { autogrow(); updateSend(); });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(input.value); }
});
document.getElementById("side-new").onclick = newChat;
document.getElementById("side-toggle").onclick = () => document.body.classList.toggle("sidebar-open");
document.getElementById("sidebar-scrim").onclick = closeSidebar;

chats = loadChats();
// авто-запуск вопроса из ссылки (?q=…) — клик по карточке на /demo: ВСЕГДА новый чат
const _qParam = new URLSearchParams(location.search).get("q");
if (_qParam) {
  history.replaceState({}, "", location.pathname);
  activeId = sessionId;          // свежий чат (sessionId — новый), восстановление пропускаем
  renderSidebar();
  updateSend();
  sendText(_qParam);             // создаёт новый чат и отправляет вопрос
} else {
  const savedActive = (() => { try { return localStorage.getItem(LS_KEY + "_active"); } catch { return null; } })();
  if (savedActive && chats.some((c) => c.id === savedActive)) {
    activeId = savedActive; sessionId = savedActive;
    renderChat(activeChat());     // восстановить последний чат + подсветить его
  } else {
    activeId = sessionId;          // свежий пустой чат → экран приветствия
    renderSuggestions();
  }
  renderSidebar();
  updateSend();
}

// --- Дровер автоотчётов ---
const DEMO_CRON = "*/5 * * * *";
const overlay = document.getElementById("overlay");
const drawer = document.getElementById("drawer");
const toast = document.getElementById("toast");
const CRON_HUMAN = { "*/5 * * * *": "каждые 5 минут", "0 * * * *": "каждый час", "0 9 * * *": "ежедневно 09:00", "0 9 * * 1": "по понедельникам 09:00" };
const cronHuman = (c) => CRON_HUMAN[c] || c;
const showToast = (t) => { toast.textContent = t; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2600); };
const api = (url, opts) => fetch(url, opts).then((r) => r.json().catch(() => ({})));

function openDrawer() { overlay.classList.add("open"); drawer.classList.add("open"); loadSchedules(); }
function closeDrawer() { overlay.classList.remove("open"); drawer.classList.remove("open"); }

async function loadSchedules() {
  let list = [];
  try { list = await api("/api/schedules"); } catch { /* */ }
  const demo = list.find((s) => s.cron === DEMO_CRON);
  const ds = document.getElementById("demo-slot");
  ds.innerHTML = "";
  const drow = el("div", "sch demo");
  drow.innerHTML = '<div style="flex:1"><div class="sch-name">⚡ Демо-режим</div><div class="sch-sub">автоотчёт каждые 5 минут — для показа на защите</div></div>';
  const dtg = el("button", "toggle" + (demo && demo.enabled ? "" : " off"));
  dtg.onclick = async () => {
    if (demo) await api("/api/schedules/" + demo.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !demo.enabled }) });
    else await api("/api/schedules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Демо (каждые 5 мин)", cron: DEMO_CRON }) });
    loadSchedules();
  };
  drow.appendChild(dtg); ds.appendChild(drow);

  const cont = document.getElementById("sch-list"); cont.innerHTML = "";
  const reg = list.filter((s) => s.cron !== DEMO_CRON);
  if (!reg.length) cont.innerHTML = '<div class="sch-sub" style="padding:2px 2px 8px">Пока нет расписаний.</div>';
  reg.forEach((s) => {
    const row = el("div", "sch");
    const last = s.lastRunAt ? " · последний: " + new Date(s.lastRunAt).toLocaleString("ru") : "";
    row.innerHTML = '<div style="flex:1"><div class="sch-name">' + esc(s.name) + '</div><div class="sch-sub">' + cronHuman(s.cron) + last + "</div></div>";
    const tg = el("button", "toggle" + (s.enabled ? "" : " off"));
    tg.onclick = async () => { await api("/api/schedules/" + s.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !s.enabled }) }); loadSchedules(); };
    const del = el("button", "sch-del", svg("trash", 16));
    del.onclick = async () => { await fetch("/api/schedules/" + s.id, { method: "DELETE" }); loadSchedules(); };
    row.appendChild(tg); row.appendChild(del); cont.appendChild(row);
  });
}

document.getElementById("reports-btn").onclick = openDrawer;
document.getElementById("drawer-close").onclick = closeDrawer;
overlay.onclick = closeDrawer;
document.getElementById("sch-add").onclick = async () => {
  const name = document.getElementById("sch-name").value.trim() || "Отчёт";
  const cron = document.getElementById("sch-cron").value;
  await api("/api/schedules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, cron }) });
  document.getElementById("sch-name").value = "";
  loadSchedules(); showToast("Расписание добавлено");
};
document.getElementById("collect-now").onclick = async () => {
  showToast("Собираю отчёт…");
  try { await fetch("/api/report", { method: "POST" }); showToast("Отчёт собран и отправлен"); }
  catch { showToast("Ошибка сборки"); }
};
