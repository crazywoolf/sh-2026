// Регрессионный прогон против ЖИВОГО URL: проверяет ПОВЕДЕНИЕ и ЧИСЛА (не «вайб»).
// Запуск: REG_BASE=https://team-004.aisouthhack.ru node --env-file=.env --import tsx src/eval/regression-run.ts
//   (без REG_BASE — бьёт по localhost:8000)
import { mkdirSync, writeFileSync } from "node:fs";
import { REG_QUESTIONS, type RegQ, type Assert } from "./regression-questions.ts";

const BASE = process.env.REG_BASE ?? "http://localhost:8000";

function answerText(j: unknown): string {
  if (j && typeof j === "object") {
    const b = j as Record<string, unknown>;
    for (const k of ["response", "answer", "message", "content", "text"]) {
      if (typeof b[k] === "string") return b[k] as string;
    }
  }
  return "";
}

// нормализация: нижний регистр, десятичная запятая→точка, схлопнуть пробелы
function norm(s: string): string {
  return s.toLowerCase().replace(/(\d)[  ]*,[  ]*(\d)/g, "$1.$2").replace(/\s+/g, " ");
}
// для чисел: убрать пробелы-разделители тысяч внутри числа
function normNum(s: string): string {
  return s.toLowerCase().replace(/(\d)[  ](?=\d)/g, "$1").replace(/(\d),(\d)/g, "$1.$2");
}

type Check = { ok: boolean; label: string };
function evalAssert(a: Assert, text: string, insufficient: boolean): Check[] {
  const n = norm(text);
  const nn = normNum(text);
  const checks: Check[] = [];
  if (a.insufficient !== undefined)
    checks.push({ ok: insufficient === a.insufficient, label: `insufficient=${a.insufficient}` });
  for (const num of a.numbers ?? [])
    checks.push({ ok: nn.includes(num.toLowerCase()), label: `число «${num}»` });
  for (const s of a.includesAll ?? [])
    checks.push({ ok: n.includes(s.toLowerCase()), label: `есть «${s}»` });
  if (a.includesAny?.length)
    checks.push({ ok: a.includesAny.some((s) => n.includes(s.toLowerCase())), label: `любое из [${a.includesAny.join(", ")}]` });
  return checks;
}

async function ask(message: string) {
  const res = await fetch(BASE + "/api/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const raw = await res.text();
  let j: unknown = null;
  try { j = JSON.parse(raw); } catch { /* */ }
  const insufficient = !!(j && typeof j === "object" && (j as Record<string, unknown>).insufficient_data === true);
  return { text: answerText(j) || raw, insufficient, status: res.status };
}

type Row = { q: RegQ; pass: boolean; checks: Check[]; text: string; status: number };

async function main() {
  console.log(`Регрессионный прогон по ${BASE} — ${REG_QUESTIONS.length} вопросов\n`);
  const rows: Row[] = [];
  for (const q of REG_QUESTIONS) {
    try {
      const a = await ask(q.q);
      const checks = evalAssert(q.assert, a.text, a.insufficient);
      const pass = a.status === 200 && checks.every((c) => c.ok);
      rows.push({ q, pass, checks, text: a.text, status: a.status });
      const mark = pass ? "✅" : "❌";
      const failed = checks.filter((c) => !c.ok).map((c) => c.label).join("; ");
      console.log(`${mark} #${q.id} [${q.cat}] ${q.q}`);
      if (!pass) console.log(`     провал: ${failed || `HTTP ${a.status}`}`);
    } catch (e) {
      rows.push({ q, pass: false, checks: [], text: String(e), status: 0 });
      console.log(`❌ #${q.id} [${q.cat}] ИСКЛЮЧЕНИЕ: ${String(e).slice(0, 80)}`);
    }
  }

  const passed = rows.filter((r) => r.pass).length;
  const byCat = new Map<string, { p: number; t: number }>();
  for (const r of rows) {
    const c = byCat.get(r.q.cat) ?? { p: 0, t: 0 };
    c.t++; if (r.pass) c.p++; byCat.set(r.q.cat, c);
  }
  console.log(`\nИТОГ: ${passed}/${rows.length} прошло`);
  for (const [cat, c] of byCat) console.log(`  ${c.p === c.t ? "✅" : "⚠️"} ${cat}: ${c.p}/${c.t}`);

  // отчёт
  mkdirSync("docs/stage9", { recursive: true });
  const md = [
    `# Регрессионный прогон под эталон судьи`, ``,
    `БД-источник: ${BASE} · пройдено **${passed}/${rows.length}**`, ``,
    `| # | Категория | Вопрос | Итог | Провалы |`, `|---|---|---|---|---|`,
    ...rows.map((r) => `| ${r.q.id} | ${r.q.cat} | ${r.q.q.replace(/\|/g, "/")} | ${r.pass ? "✅" : "❌"} | ${r.checks.filter((c) => !c.ok).map((c) => c.label).join("; ") || (r.pass ? "" : `HTTP ${r.status}`)} |`),
    ``, `## Ответы (превью)`, ``,
    ...rows.map((r) => `**#${r.q.id} ${r.q.q}**\n\n${r.text.replace(/\s+/g, " ").slice(0, 400)}\n`),
  ].join("\n");
  writeFileSync("docs/stage9/regression-results.md", md);
  console.log(`\nОтчёт: docs/stage9/regression-results.md`);
}

main();
