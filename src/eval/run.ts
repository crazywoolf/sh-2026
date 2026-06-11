// Харнесс этапа 4: прогон банка вопросов через живой пайплайн + LLM-судья.
// Запуск: node --env-file=.env --import tsx src/eval/run.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { createLLMClient } from "../llm/client.ts";
import { buildAgents } from "../wiring.ts";
import { runPipeline } from "../orchestrator.ts";
import { runSelect } from "../db/duck.ts";
import { judge, type JudgeVerdict } from "./judge.ts";
import { EVAL_CASES, type EvalCase } from "./questions.ts";

type Row = {
  c: EvalCase;
  gotInsufficient: boolean;
  flagOk: boolean;
  crashed: boolean;
  hasTrace: boolean;
  response: string;
  traceStr: string;
  verdict?: JudgeVerdict;
};

function trunc(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}

async function main() {
  const llm = createLLMClient();
  const agents = buildAgents(llm);
  const rows: Row[] = [];

  for (const c of EVAL_CASES) {
    let response = "";
    let gotInsufficient = true;
    let crashed = false;
    let hasTrace = false;
    let traceStr = "";
    let verdict: JudgeVerdict | undefined;

    try {
      const r = await runPipeline(agents, { message: c.question });
      response = r.response;
      gotInsufficient = r.insufficient_data;
      hasTrace = r.trace.length > 0;
      traceStr = r.trace.map((t) => t.agent + (t.verdict ? `(${t.verdict})` : "")).join(" → ");
      crashed = response.includes("внутренн") && response.includes("ошибк");
    } catch (e) {
      crashed = true;
      response = "PIPELINE EXCEPTION: " + String(e);
    }

    const flagOk = gotInsufficient === (c.expectedFlag === "insufficient");

    // LLM-судья: только для answerable, где есть эталон и система реально ответила
    if (c.expectedFlag === "answerable" && c.referenceSql && !gotInsufficient && !crashed) {
      try {
        const ref = await runSelect(c.referenceSql);
        verdict = await judge(llm, c.question, response, ref.rows);
      } catch (e) {
        verdict = { verdict: "wrong", score: 0, notes: "ошибка судьи/эталона: " + trunc(String(e), 120) };
      }
    }

    rows.push({ c, gotInsufficient, flagOk, crashed, hasTrace, response, traceStr, verdict });
    const v = verdict ? `${verdict.verdict}/${verdict.score}` : "-";
    console.log(
      `#${String(c.id).padStart(2)} [${c.expectedFlag}] flag=${flagOk ? "OK " : "FAIL"} crash=${crashed ? "Y" : "n"} judge=${v}`,
    );
  }

  // --- Сводка ---
  const total = rows.length;
  const flagOkN = rows.filter((r) => r.flagOk).length;
  const crashN = rows.filter((r) => r.crashed).length;
  const judged = rows.filter((r) => r.verdict);
  const correct = judged.filter((r) => r.verdict!.verdict === "correct").length;
  const partial = judged.filter((r) => r.verdict!.verdict === "partial").length;
  const wrong = judged.filter((r) => r.verdict!.verdict === "wrong").length;
  const avgScore = judged.length
    ? Math.round(judged.reduce((s, r) => s + (r.verdict!.score || 0), 0) / judged.length)
    : 0;

  // --- Markdown-отчёт ---
  const lines: string[] = [];
  lines.push("# Этап 4 — результаты прогона банка вопросов\n");
  lines.push(`Прогон через живой пайплайн (YandexGPT) + LLM-судья на корректность.\n`);
  lines.push("## Сводка\n");
  lines.push(`- Всего вопросов: **${total}**`);
  lines.push(`- Boundary discipline (флаг answerable/insufficient верен): **${flagOkN}/${total}**`);
  lines.push(`- Падений/внутренних ошибок: **${crashN}**`);
  lines.push(
    `- Судья (answerable): correct **${correct}**, partial **${partial}**, wrong **${wrong}** из ${judged.length}; средний score **${avgScore}**\n`,
  );
  lines.push("## Детали\n");
  lines.push("| # | Ожид. | Флаг | Crash | Судья | Score | Вопрос | Ответ (кратко) | Заметка судьи |");
  lines.push("|---|-------|------|-------|-------|-------|--------|----------------|---------------|");
  for (const r of rows) {
    lines.push(
      `| ${r.c.id} | ${r.c.expectedFlag} | ${r.flagOk ? "✅" : "❌"} | ${r.crashed ? "❌" : "·"} | ${
        r.verdict?.verdict ?? "-"
      } | ${r.verdict?.score ?? "-"} | ${trunc(r.c.question, 70)} | ${trunc(r.response, 90)} | ${
        r.verdict?.notes ? trunc(r.verdict.notes, 80) : "·"
      } |`,
    );
  }
  lines.push("\n## Проблемные кейсы (для усиления Critic/метрик)\n");
  for (const r of rows.filter((x) => !x.flagOk || x.crashed || x.verdict?.verdict === "wrong")) {
    lines.push(`### #${r.c.id} — ${r.c.question}`);
    lines.push(`- ожидалось: ${r.c.expectedFlag}; флаг: ${r.flagOk ? "ок" : "НЕВЕРНО"}; crash: ${r.crashed}`);
    if (r.verdict) lines.push(`- судья: ${r.verdict.verdict}/${r.verdict.score} — ${r.verdict.notes ?? ""}`);
    lines.push(`- ответ: ${trunc(r.response, 300)}`);
    lines.push(`- trace: ${r.traceStr}\n`);
  }

  mkdirSync("docs/stage4", { recursive: true });
  writeFileSync("docs/stage4/eval-results.md", lines.join("\n"));
  console.log(`\nОтчёт: docs/stage4/eval-results.md`);
  console.log(
    `ИТОГ: flag ${flagOkN}/${total}, crash ${crashN}, судья correct/partial/wrong = ${correct}/${partial}/${wrong}, avg ${avgScore}`,
  );
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
