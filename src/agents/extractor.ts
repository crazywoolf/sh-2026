import { z } from "zod";
import { type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";
import { runSelect } from "../db/duck.ts";
import { METRICS, findMetric } from "../metrics/library.ts";

const PlanSchema = z.object({
  approach: z.enum(["metric_template", "free_sql"]),
  metric_id: z.string().nullish(),
  sql: z.string().nullish(),
  reason: z.string(),
});

const SYSTEM = `Ты — Extractor системы Meridian. По вопросу выбери способ получить данные из DuckDB.
Доступные метрики (используй approach="metric_template" и metric_id, если подходит):
${METRICS.map((m) => `- ${m.id}: ${m.question_ru}`).join("\n")}
Если ни одна не подходит — approach="free_sql" и напиши ОДИН SELECT-запрос (только чтение, таблицы:
customers, orders, product_lines, nps_responses, customer_activity_monthly, churn_reasons,
financials_monthly, unit_economics_monthly). НЕ смешивай orders и financials. Верни JSON {approach, metric_id?, sql?, reason}.`;

export async function extract(llm: LLMClient, question: string): Promise<ExtractorOutput> {
  const p = await callJSON(llm, SYSTEM, `Вопрос: ${question}`, PlanSchema);
  let sql = "";
  let metric_id: string | undefined;
  if (p.approach === "metric_template" && p.metric_id) {
    const m = findMetric(p.metric_id);
    if (m) { sql = m.sql; metric_id = m.id; }
  } else if (p.sql) {
    sql = p.sql;
  }
  if (!sql) {
    return base(p.approach, metric_id, "", "не удалось сформировать запрос", false);
  }
  try {
    const { rows, columns } = await runSelect(sql);
    const out = base(p.approach, metric_id, sql, p.reason, rows.length > 0);
    out.rows = rows.slice(0, 1000);
    out.row_count = rows.length;
    out.columns = columns.map((c) => ({ name: c, type: typeof rows[0]?.[c] }));
    return out;
  } catch (e) {
    return base(p.approach, metric_id, sql, `ошибка выполнения: ${String(e)}`, false);
  }
}

function base(
  approach: ExtractorOutput["approach"], metric_id: string | undefined,
  sql: string, notes: string, ok: boolean,
): ExtractorOutput {
  return {
    approach, metric_id, sql, columns: [], rows: [], row_count: 0,
    data_sufficient: ok, notes, assumptions: [],
  };
}
