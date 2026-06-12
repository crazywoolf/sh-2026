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
4. Превосходная степень БЕЗ метрики («лучший/худший/топ месяц/период», «когда было лучше всего») → метрика best_month_ambiguous (вернёт лучший месяц по РАЗНЫМ критериям — выручка/GMV/EBITDA, они дают РАЗНЫЕ месяцы). В reason пометь «критерий не задан — показываем по нескольким метрикам, нужно уточнение». Если метрика прямо названа («месяц с макс. выручкой») — обычный SELECT по ней.
   Вопрос про маржу «high/mid/low» или «по категориям маржи» → метрика margin_by_category (группировка по category линий, а не по отдельным линиям).
   Вопрос «выручка/клиенты по городам» → бери customers.city (город клиента), в reason пометь «город клиента, не место оказания услуги».
   «Оборот» = GMV. Вопрос про оборот/GMV ПО ГОДАМ / «за <годы>» / «как менялся за годы» (без слова «месяц») → метрика gmv_by_year (годовые значения + итоговый YoY %). Помесячную gmv_dynamics_monthly — только при явном «по месяцам/помесячно». «выручка» (динамика годовая) → revenue_net_yoy. Эти данные ВСЕГДА есть в financials_monthly — НИКОГДА не отвечай «недостаточно» на вопрос про GMV/выручку/take_rate.
   КОМИССИЯ платформы / take rate / монетизация (что происходит, динамика, «по годам») → метрика monetization_by_year (ГОДОВОЙ срез, take rate уже в ПРОЦЕНТАХ: 6.89% в 2023 → 4.24% в 2025). take_rate_dynamics (помесячно) бери ТОЛЬКО если явно просят «по месяцам». Take rate всегда подавай в % (не в долях 0.06).
   Вопрос про NPS/удовлетворённость в ДИНАМИКЕ или с сомнением (смещение, искажение, «реально ли растёт», «NPS вырос — продукт правда стал лучше?», «можно ли утверждать, что клиенты довольнее») → метрика nps_bias_trend (рост NPS идёт за счёт падения доли детракторов и снижения числа ответов = смещение выжившей когорты, а не реальное улучшение). Только если просят NPS снапшотом/в моменте — nps_overall.
   Вопрос про связь NPS↔ОТТОК или NPS по ЛИНИЯМ («высокий NPS → низкий отток?», «где NPS ниже», «связан ли NPS с оттоком») → метрика nps_by_product_line (разброс NPS по линиям ЕСТЬ → data_sufficient=true, НЕ отказ!). В reason пометь: прямой разбивки оттока по линиям в данных нет, NPS и отток — разные измерения, высокий NPS не гарантирует низкий отток.
   Вопрос «рост оборота/GMV → бизнес больше зарабатывает / прибыль / выручка?» → метрика monetization_by_year (ГОДОВОЙ срез: GMV, выручка, take rate % — ответ по смыслу «нет, монетизация падает»).
   Вопрос про GMV/оборот по СЕГМЕНТАМ КЛИЕНТОВ (Large/Mid/SMB, «крупный/средний/малый сегмент», «уход/фокус на Large», «где сосредоточен оборот по сегментам») → метрика gmv_by_customer_segment (customers.segment). НЕ путай с продуктовыми категориями/линиями — тут нужен КЛИЕНТСКИЙ сегмент.
   Вопрос про LTV/CAC по сегментам / окупаемость привлечения → метрика ltv_cac_by_segment (канонические значения Large 3.03 / Mid 1.68 / SMB 0.59). НЕ пересчитывай LTV/CAC ad-hoc своим SQL — бери метрику, чтобы цифры были стабильны.
   Вопрос про ВОВЛЕЧЁННОСТЬ/АКТИВНОСТЬ («пользователи стали активнее», «входов больше», «активность выросла → бизнес здоровее / больше заказывают?») → метрика engagement_vanity_vs_real (входы растут 4.79→5.45, но заказов на клиента МЕНЬШЕ 1.11→0.95 = vanity-активность ≠ экономическая).
   Вопрос про СРЕДНИЙ ЧЕК / доход с заказа / «чек стабилен → доход тоже?» → метрика order_value_vs_revenue (GMV на заказ ~106к стабилен, но выручка платформы с заказа падает 7890→4553).
   Вопрос про ЭКОНОМИЧЕСКИЙ отток / спящих клиентов / отличие реального оттока от формального / «сколько РЕАЛЬНО перестали приносить деньги / перестали заказывать / формально НЕ ушли, но неактивны» → метрика economic_churn_dormant (доля неактивных dormant+churning на конец года 18→33%). НЕ давай на это формальный churn_rate_formal (35.5%) — там спрашивают именно про экономически неактивных. Чисто формальный отток → churn_rate_formal.
   Вопрос-проверка «формальный отток УПАЛ/снизился/вдвое → база СТАБИЛЬНЕЕ?» → метрика churn_formal_vs_economic_yearly (формальный отток по годам 3909→1863 ПРОТИВ роста неактивных 18%→33% на конец года — да, формально упал, но экономический отток растёт = база НЕ стабильнее).
5. 🔴 НЕ считай количество клиентов через JOIN с ПОМЕСЯЧНЫМИ панелями (unit_economics_monthly, customer_activity_monthly): в них 36 строк на клиента, поэтому COUNT/SUM по клиентам раздувается в разы (получишь «миллионы клиентов» при базе ~25 000). Уникальных клиентов и отток считай ТОЛЬКО из customers / churn_reasons (1 строка на клиента).
6. Только SELECT/WITH, без точки с запятой и служебных объектов (_*).

Верни JSON {approach, metric_id?, sql?, reason}.`;

// Детерминированный перехват неоднозначного superlative («лучший месяц» без метрики):
// LLM-маршрутизация на метрику ненадёжна, поэтому форсим её здесь.
export function isAmbiguousBestPeriod(q: string): boolean {
  const s = q.toLowerCase();
  const superlative = /(лучш|худш|удачн|успешн|пиков|рекордн|\bтоп\b|сильн)/.test(s);
  const period = /(месяц|период|квартал)/.test(s);
  const metric = /(выручк|gmv|оборот|маржа|марж|прибыл|ebitda|profit|заказ|клиент|nps|отток|take|активн|чек|трафик)/.test(s);
  return superlative && period && !metric;
}

export async function extract(llm: LLMClient, question: string): Promise<ExtractorOutput> {
  if (isAmbiguousBestPeriod(question)) {
    const m = findMetric("best_month_ambiguous");
    if (m) {
      try {
        const { rows, columns } = await runSelect(m.sql);
        const out = base("metric_template", m.id, m.sql,
          "критерий «лучший» не задан — показываем лучший месяц по разным метрикам, нужно уточнение", rows.length > 0);
        out.rows = rows.slice(0, 1000);
        out.row_count = rows.length;
        out.columns = columns.map((c) => ({ name: c, type: typeof rows[0]?.[c] }));
        return out;
      } catch { /* падение — уходим в обычный путь ниже */ }
    }
  }
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
