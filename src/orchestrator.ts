import { randomUUID } from "node:crypto";
import type {
  UserQuery, FinalResponse, TraceEntry, PlannerOutput,
  ExtractorOutput, AnalystOutput, CriticOutput, VizOutput,
} from "./contracts/types.ts";
import type { Turn } from "./session/store.ts";

export type Agents = {
  plan: (q: string, opts?: { context?: Turn[]; preferResearch?: boolean }) => Promise<PlannerOutput>;
  extract: (q: string, guidance?: string) => Promise<ExtractorOutput>;
  analyze: (q: string, ext: ExtractorOutput, guidance?: string) => Promise<AnalystOutput>;
  critique: (q: string, ext: ExtractorOutput, ana: AnalystOutput) => Promise<CriticOutput>;
  visualize: (ana: AnalystOutput, ext: ExtractorOutput) => Promise<VizOutput>;
};

const MAX_REVISIONS = 2;

async function answerOne(a: Agents, q: string, trace: TraceEntry[]) {
  let ext = await a.extract(q);
  trace.push({ agent: "extractor", sql: ext.sql, rows: ext.row_count });
  let ana = await a.analyze(q, ext);
  trace.push({ agent: "analyst", note: ana.method });

  for (let i = 0; i < MAX_REVISIONS; i++) {
    const crit = await a.critique(q, ext, ana);
    trace.push({ agent: "critic", verdict: crit.verdict });
    if (crit.verdict === "approved" || crit.verdict === "reject") {
      return { ext, ana, rejected: crit.verdict === "reject" };
    }
    const guidance = crit.guidance ?? undefined;
    if (crit.target === "extractor") {
      ext = await a.extract(q, guidance);
      trace.push({ agent: "extractor", sql: ext.sql, rows: ext.row_count });
    }
    ana = await a.analyze(q, ext, guidance);
    trace.push({ agent: "analyst", note: ana.method });
  }
  return { ext, ana, rejected: false };
}

export async function runPipeline(
  a: Agents,
  query: UserQuery,
  runOpts?: { context?: Turn[]; preferResearch?: boolean },
): Promise<FinalResponse> {
  const trace: TraceEntry[] = [];
  const session_id = query.session_id ?? `s-${randomUUID()}`;
  const planned = await a.plan(query.message, runOpts);
  trace.push({ agent: "planner", note: planned.mode });
  const planSummary = { mode: planned.mode, sub_questions: planned.sub_questions };

  if (planned.mode === "insufficient") {
    return {
      response: `Недостаточно данных для ответа: ${planned.reasoning}`,
      assumptions: [], trace, chart: null, insufficient_data: true, session_id,
      plan: planSummary, sub_answers: [],
    };
  }

  if (planned.sub_questions.length === 0) {
    return {
      response: `Недостаточно данных для надёжного ответа: план не содержит под-вопросов.`,
      assumptions: [], trace, chart: null, insufficient_data: true, session_id,
      plan: planSummary, sub_answers: [],
    };
  }

  // Под-вопросы — ПАРАЛЛЕЛЬНО (быстро, чтобы не упереться в таймаут прокси на синтез-вопросах).
  // Падение одного под-вопроса не валит весь ответ.
  const settled = await Promise.all(
    planned.sub_questions.map((sub) => answerOne(a, sub, trace).catch(() => null)),
  );
  const results = settled.filter((r): r is NonNullable<typeof r> => r !== null);

  if (results.length === 0) {
    return {
      response: `Недостаточно данных для надёжного ответа.`,
      assumptions: [], trace, chart: null, insufficient_data: true, session_id,
      plan: planSummary, sub_answers: [],
    };
  }

  const ok = results.filter((r) => !r.rejected && r.ext.data_sufficient);
  const insufficient = ok.length === 0;
  const used = ok.length > 0 ? ok : results;
  const primary = used[used.length - 1];
  const answer = used.length > 1
    ? used.map((r, i) => `${i + 1}. ${r.ana.answer}`).join("\n")
    : primary.ana.answer;

  const viz = insufficient ? { chart: null, rationale: "" } : await a.visualize(primary.ana, primary.ext);
  if (viz.chart) trace.push({ agent: "visualizer", note: viz.chart.type });

  const assumptions = [...new Set(results.flatMap((r) => [...r.ana.assumptions, ...r.ext.assumptions]))];
  return {
    response: insufficient ? `Недостаточно данных для надёжного ответа. ${answer}` : answer,
    assumptions, trace, chart: viz.chart, insufficient_data: insufficient, session_id,
    plan: planSummary, sub_answers: used.map((r) => r.ana.answer),
  };
}
