import { z } from "zod";
import { type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";
import { runSelect } from "../db/duck.ts";
import { METRICS, findMetric } from "../metrics/library.ts";

const PlanSchema = z.object({
  approach: z.enum(["metric_template", "free_sql"]).catch("free_sql"),
  metric_id: z.string().nullish(),
  sql: z.string().nullish(),
  reason: z.string().nullish().transform((v) => v ?? ""),
});

const SYSTEM = `Ты — Extractor системы Meridian. Задача — ПОЛУЧИТЬ данные из DuckDB под вопрос.
Доступные метрики (approach="metric_template" + metric_id, если подходящая есть):
${METRICS.map((m) => `- ${m.id}: ${m.question_ru}`).join("\n")}

Если готовой метрики нет — approach="free_sql" и напиши ОДИН SELECT (только чтение). Схема таблиц:
- financials_monthly(month, gmv, revenue_gross, revenue_net, take_rate, cogs, opex_marketing, opex_rnd, opex_admin, ebitda, capex, headcount) — P&L платформы помесячно. ЗДЕСЬ есть и GMV, и выручка, и take_rate → вопросы про их расхождение/динамику считаются ОТСЮДА.
- orders(order_id, customer_id, product_line_id, order_date, gmv, revenue, status, provider_type) — транзакции.
- customers(customer_id, segment, industry, city, employee_count_band, signup_date, churn_date, contract_type, acquisition_channel).
- product_lines(product_line_id, name, category, launch_date, status).
- nps_responses(response_id, customer_id, product_line_id, response_date, score, category[promoter/passive/detractor], comment_tag).
- customer_activity_monthly(customer_id, month, orders_count, gmv_total, days_active, login_count, status[active/churning/dormant/churned]).
- churn_reasons(customer_id, churn_date, primary_reason[price/no_need/quality/consolidation/ai_alternative/other], competitor_named, interview_completed, nps_at_churn).
- unit_economics_monthly(month, segment[SMB/Mid/Large], product_line_id, cac, ltv_12m, payback_months, gross_margin_pct, take_rate_effective, new_customers).

ПРАВИЛА:
1. По умолчанию ВСЕГДА пытайся сформировать SELECT. "insufficient" — НЕ твоя работа; если данные есть хоть частично, верни их.
2. Не смешивай orders и financials в ОДНОМ запросе (это разные слои). Но расхождение GMV/выручки берётся из financials_monthly (там есть оба поля) — это считаемо.
3. NPS = % promoter − % detractor (а не среднее score). Выручку по заказам — фильтр status='completed'.
   Доли СТАТУСОВ заказов (отменённые/возвращённые/спорные) считай от ВСЕХ заказов (база = все статусы, включая completed), используй метрику order_status_dist.
4. Если вопрос неоднозначен (напр. «лучший месяц») — выбери разумную метрику (по выручке) и опиши выбор в reason; данные всё равно верни.
   Вопрос про маржу «high/mid/low» или «по категориям маржи» → метрика margin_by_category (группировка по category линий, а не по отдельным линиям).
   Вопрос «выручка/клиенты по городам» → бери customers.city (город клиента), в reason пометь «город клиента, не место оказания услуги».
5. Только SELECT/WITH, без точки с запятой и служебных объектов (_*).

Верни JSON {approach, metric_id?, sql?, reason}.`;

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
