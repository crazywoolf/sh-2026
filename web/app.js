const sessionId = "web-" + Math.random().toString(36).slice(2);
let chartSeq = 0;

async function ask(message, preferResearch) {
  const res = await fetch("/api/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId, prefer_research: !!preferResearch }),
  });
  return res.json();
}

function renderChart(parent, chart) {
  if (!chart || !chart.data || !chart.data.length) return;
  const canvas = document.createElement("canvas");
  canvas.id = "c" + chartSeq++;
  parent.appendChild(canvas);
  const x = chart.x, y = Array.isArray(chart.y) ? chart.y[0] : chart.y;
  const labels = chart.data.map((r) => String(r[x]));
  const values = chart.data.map((r) => Number(r[y]));
  const type = ["line", "bar", "pie", "scatter"].includes(chart.type) ? chart.type : "bar";
  new Chart(canvas, {
    type, data: { labels, datasets: [{ label: chart.title || y, data: values, backgroundColor: "#5d56c4" }] },
    options: { plugins: { legend: { display: type === "pie" } }, responsive: true },
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

function botBubble(parent, r) {
  const b = document.createElement("div");
  b.className = "bubble bot" + (r.insufficient_data ? " insufficient" : "");
  b.innerHTML = `<div>${escapeHtml(r.response).replace(/\n/g, "<br>")}</div>`;
  renderChart(b, r.chart);
  if (r.assumptions && r.assumptions.length) {
    const d = document.createElement("details");
    d.innerHTML = `<summary>Допущения (${r.assumptions.length})</summary>` +
      r.assumptions.map((a) => `<div class="meta">• ${escapeHtml(a)}</div>`).join("");
    b.appendChild(d);
  }
  if (r.trace && r.trace.length) {
    const d = document.createElement("details");
    d.innerHTML = `<summary>Трасса агентов</summary><div class="meta">` +
      r.trace.map((t) => t.agent + (t.verdict ? "(" + t.verdict + ")" : "")).join(" → ") + `</div>`;
    b.appendChild(d);
  }
  parent.appendChild(b);
}

function userBubble(parent, text) {
  const b = document.createElement("div"); b.className = "bubble user"; b.textContent = text; parent.appendChild(b);
}
function loader(parent) {
  const l = document.createElement("div"); l.className = "loader"; l.textContent = "Думаю…"; parent.appendChild(l); return l;
}

document.getElementById("chat-send").onclick = async () => {
  const inp = document.getElementById("chat-input"); const log = document.getElementById("chat-log");
  const q = inp.value.trim(); if (!q) return; inp.value = "";
  userBubble(log, q); const l = loader(log);
  try { const r = await ask(q, false); l.remove(); botBubble(log, r); }
  catch { l.textContent = "Ошибка запроса"; }
};

document.getElementById("research-send").onclick = async () => {
  const inp = document.getElementById("research-input"); const log = document.getElementById("research-log");
  const q = inp.value.trim(); if (!q) return; inp.value = "";
  userBubble(log, q); const l = loader(log);
  try {
    const r = await ask(q, true); l.remove();
    if (r.plan && r.plan.sub_questions.length > 1) {
      const d = document.createElement("div"); d.className = "bubble bot";
      d.innerHTML = "<b>Декомпозиция исследования:</b>" +
        r.plan.sub_questions.map((s, i) => `<div class="subq">${i + 1}. ${escapeHtml(s)}</div>`).join("");
      log.appendChild(d);
    }
    botBubble(log, r);
  } catch { l.textContent = "Ошибка запроса"; }
};

document.getElementById("report-now").onclick = async () => {
  const out = document.getElementById("reports-out"); out.innerHTML = '<div class="loader">Собираю дашборд здоровья…</div>';
  try {
    const res = await fetch("/api/report", { method: "POST" }); const rep = await res.json();
    renderReport(out, rep);
  } catch { out.innerHTML = "Ошибка сборки отчёта"; }
};

function renderReport(out, rep) {
  out.innerHTML = `<h3>Дашборд здоровья — ${new Date(rep.generatedAt).toLocaleString("ru")}</h3>`;
  const grid = document.createElement("div"); grid.className = "cards";
  for (const it of rep.items) {
    const c = document.createElement("div"); c.className = "card" + (it.alert ? " alert" : "");
    c.innerHTML = `<h3>${escapeHtml(it.title)}</h3><div class="val">${escapeHtml(it.response).slice(0, 220)}</div>`;
    renderChart(c, it.chart);
    grid.appendChild(c);
  }
  out.appendChild(grid);
  const recs = rep.recommendations || [];
  if (recs.length) {
    const box = document.createElement("div");
    box.className = "bubble";
    box.innerHTML = "<b>💡 Рекомендации</b>" +
      recs.map((r) => `<div class="subq">${escapeHtml(r)}</div>`).join("");
    out.appendChild(box);
  }
}

document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".pane").forEach((p) => p.classList.add("hidden"));
    t.classList.add("active");
    document.getElementById(t.dataset.tab).classList.remove("hidden");
  };
});
