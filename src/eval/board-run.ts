// Прогон пула вопросов совета директоров по ЖИВОМУ URL + судья качества → карта пробелов.
// Запуск: BOARD_BASE=https://team-004.aisouthhack.ru node --env-file=.env --import tsx src/eval/board-run.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { createLLMClient } from "../llm/client.ts";
import { boardJudge, type BoardVerdict } from "./board-judge.ts";
import { BOARD_QUESTIONS, type BoardQ } from "./board-questions.ts";

const BASE = process.env.BOARD_BASE ?? "https://team-004.aisouthhack.ru";

type Row = {
  q: BoardQ;
  gotInsufficient: boolean;
  response: string;
  autoGap: string;
  verdict?: BoardVerdict;
};

function answerText(j: unknown): string {
  if (j && typeof j === "object") {
    const b = j as Record<string, unknown>;
    for (const k of ["response", "answer", "message", "content", "text"]) {
      if (typeof b[k] === "string") return b[k] as string;
    }
  }
  return "";
}

async function ask(message: string) {
  const res = await fetch(BASE + "/api/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const raw = await res.text();
  let j: unknown = null;
  try { j = JSON.parse(raw); } catch { /* */ }
  const gotInsufficient = !!(j && typeof j === "object" && (j as Record<string, unknown>).insufficient_data === true);
  return { text: answerText(j) || raw, gotInsufficient, status: res.status };
}

function trunc(s: string, n: number) { return s.replace(/\s+/g, " ").trim().slice(0, n); }

async function main() {
  const llm = createLLMClient();
  const rows: Row[] = [];

  for (const q of BOARD_QUESTIONS) {
    let r: Row = { q, gotInsufficient: true, response: "", autoGap: "" };
    try {
      const a = await ask(q.q);
      r.response = a.text;
      r.gotInsufficient = a.gotInsufficient;
      // авто-флаги границ
      if (q.expect !== "insufficient" && a.gotInsufficient) r.autoGap = "🔴 ЛОЖНЫЙ ОТКАЗ (данные есть)";
      else if (q.expect === "insufficient" && !a.gotInsufficient) r.autoGap = "🔴 должен был отказать";
      // судья качества (кроме корректно отклонённых граничных)
      const skipJudge = q.expect === "insufficient" && a.gotInsufficient;
      if (!skipJudge) r.verdict = await boardJudge(llm, q.q, a.text);
    } catch (e) {
      r.autoGap = "ИСКЛЮЧЕНИЕ: " + trunc(String(e), 80);
    }
    rows.push(r);
    const v = r.verdict ? `${r.verdict.verdict}/${r.verdict.score}` : "—";
    console.log(`#${String(q.id).padStart(2)} [${q.cat}] ${r.autoGap ? "GAP" : "ok "} judge=${v}  ${trunc(q.q, 44)}`);
  }

  // сводка
  const good = rows.filter((r) => r.verdict?.verdict === "good").length;
  const partial = rows.filter((r) => r.verdict?.verdict === "partial").length;
  const poor = rows.filter((r) => r.verdict?.verdict === "poor").length;
  const falseRefusals = rows.filter((r) => r.autoGap.includes("ЛОЖНЫЙ")).length;
  const judged = rows.filter((r) => r.verdict);
  const avg = judged.length ? Math.round(judged.reduce((s, r) => s + (r.verdict!.score || 0), 0) / judged.length) : 0;

  const L: string[] = [];
  L.push("# Карта пробелов — вопросы совета директоров\n");
  L.push(`Прогон по \`${BASE}\` + судья качества (reference-free).\n`);
  L.push("## Сводка\n");
  L.push(`- Вопросов: **${rows.length}**`);
  L.push(`- Судья: good **${good}**, partial **${partial}**, poor **${poor}** (средний score **${avg}**)`);
  L.push(`- 🔴 Ложных отказов: **${falseRefusals}**\n`);
  L.push("## Детали\n");
  L.push("| # | Категория | Вопрос | Insuff | Судья | Score | Пробелы |");
  L.push("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const gaps = [r.autoGap, ...(r.verdict?.gap ?? [])].filter(Boolean).join("; ");
    L.push(`| ${r.q.id} | ${r.q.cat} | ${trunc(r.q.q, 46)} | ${r.gotInsufficient ? "да" : "—"} | ${r.verdict?.verdict ?? "—"} | ${r.verdict?.score ?? "—"} | ${trunc(gaps, 100)} |`);
  }
  L.push("\n## Приоритетные пробелы (poor + ложные отказы)\n");
  for (const r of rows.filter((x) => x.verdict?.verdict === "poor" || x.autoGap.includes("ЛОЖНЫЙ"))) {
    L.push(`### #${r.q.id} [${r.q.cat}] — ${r.q.q}`);
    if (r.autoGap) L.push(`- ${r.autoGap}`);
    if (r.verdict) L.push(`- судья: ${r.verdict.verdict}/${r.verdict.score} — пробелы: ${r.verdict.gap.join("; ")}`);
    L.push(`- ответ: ${trunc(r.response, 240)}\n`);
  }

  mkdirSync("docs/stage8", { recursive: true });
  writeFileSync("docs/stage8/board-gap-map.md", L.join("\n"));
  console.log(`\nОтчёт: docs/stage8/board-gap-map.md`);
  console.log(`ИТОГ: good/partial/poor = ${good}/${partial}/${poor}, ложных отказов ${falseRefusals}, avg ${avg}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
