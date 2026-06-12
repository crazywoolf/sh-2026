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

function renderChart(parent, chart) {
  if (!chart || !chart.data || !chart.data.length) return;
  const wrap = el("div", "chart-wrap");
  const canvas = document.createElement("canvas");
  canvas.id = "c" + chartSeq++;
  wrap.appendChild(canvas); parent.appendChild(wrap);
  const x = chart.x, y = Array.isArray(chart.y) ? chart.y[0] : chart.y;
  const labels = chart.data.map((r) => String(r[x]));
  const values = chart.data.map((r) => Number(r[y]));
  const type = ["line", "bar", "pie", "scatter"].includes(chart.type) ? chart.type : "bar";
  const palette = ["#5d56c4", "#1d9e75", "#e24b4a", "#ba7517", "#378add", "#7f77dd", "#d4537e"];
  new Chart(canvas, {
    type,
    data: { labels, datasets: [{ label: chart.title || y, data: values, backgroundColor: type === "pie" ? palette : "#5d56c4", borderColor: "#5d56c4", borderWidth: type === "line" ? 2 : 0, tension: .3 }] },
    options: { plugins: { legend: { display: type === "pie" }, title: { display: !!chart.title, text: chart.title, color: "#6c6f76", font: { size: 12 } } }, scales: type === "pie" ? {} : { y: { beginAtZero: true } }, responsive: true, maintainAspectRatio: true },
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
  if (r.trace && r.trace.length) meta.appendChild(toggleBtn(svg("list", 13) + "Трасса агентов", '<div class="trace-line">' + r.trace.map((t) => t.agent + (t.verdict ? "(" + t.verdict + ")" : "")).join(" → ") + "</div>"));
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
  input.value = ""; autogrow();
  const node = thinkingMsg();
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: q, session_id: sessionId }),
    });
    const r = await res.json();
    botAnswer(node, r);
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
document.getElementById("new-chat").onclick = () => {
  sessionId = "web-" + Math.random().toString(36).slice(2);
  location.reload();
};
document.getElementById("reports-btn").onclick = () => { /* Фаза 2: дровер автоотчётов */ };
renderSuggestions();
updateSend();
