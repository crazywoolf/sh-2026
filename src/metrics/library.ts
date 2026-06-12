export type Metric = { id: string; question_ru: string; sql: string };

export const METRICS: Metric[] = [
  // --- P&L / монетизация (financials_monthly: gmv, revenue_net/gross, take_rate, ebitda) ---
  {
    id: "monetization_by_year",
    question_ru: "Монетизация / КОМИССИЯ платформы по годам: GMV, чистая выручка и take rate (в %) — почему выручка падает при росте GMV",
    sql: `SELECT year(month) AS year,
                 round(sum(gmv)) AS gmv,
                 round(sum(revenue_net)) AS revenue_net,
                 round(100.0*avg(take_rate), 2) AS take_rate_pct
          FROM financials_monthly GROUP BY 1 ORDER BY 1`,
  },
  {
    id: "revenue_net_yoy",
    question_ru: "Динамика чистой выручки по годам и YoY",
    sql: `SELECT year(month) AS year, sum(revenue_net) AS revenue_net,
                 round(100.0*(sum(revenue_net)-lag(sum(revenue_net)) OVER(ORDER BY year(month)))
                       /lag(sum(revenue_net)) OVER(ORDER BY year(month)),1) AS yoy_pct
          FROM financials_monthly GROUP BY 1 ORDER BY 1`,
  },
  {
    id: "revenue_dynamics_monthly",
    question_ru: "Помесячная динамика чистой выручки",
    sql: `SELECT month, round(revenue_net) AS revenue_net FROM financials_monthly ORDER BY month`,
  },
  {
    id: "gmv_dynamics_monthly",
    question_ru: "Помесячная динамика GMV (оборота)",
    sql: `SELECT month, round(gmv) AS gmv FROM financials_monthly ORDER BY month`,
  },
  {
    id: "take_rate_dynamics",
    question_ru: "Динамика take rate (доли платформы) ПО МЕСЯЦАМ (в %)",
    sql: `SELECT month, round(100.0*take_rate, 2) AS take_rate_pct FROM financials_monthly ORDER BY month`,
  },
  {
    id: "best_month_by_revenue",
    question_ru: "Лучшие месяцы по чистой выручке (топ-5)",
    sql: `SELECT month, round(revenue_net) AS revenue_net FROM financials_monthly ORDER BY revenue_net DESC LIMIT 5`,
  },
  {
    id: "best_month_by_gmv",
    question_ru: "Лучшие месяцы по GMV (топ-5)",
    sql: `SELECT month, round(gmv) AS gmv FROM financials_monthly ORDER BY gmv DESC LIMIT 5`,
  },
  {
    id: "ebitda_margin_dynamics",
    question_ru: "Динамика EBITDA-маржи по месяцам",
    sql: `SELECT month, round(ebitda/revenue_net, 3) AS ebitda_margin FROM financials_monthly ORDER BY month`,
  },

  // --- Выручка/GMV по продуктовым линиям (orders + product_lines) ---
  {
    id: "revenue_by_product_line",
    question_ru: "Выручка по продуктовым линиям (по завершённым заказам)",
    sql: `SELECT pl.name AS product_line, round(sum(o.revenue)) AS revenue
          FROM orders o JOIN product_lines pl USING(product_line_id)
          WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "gmv_by_product_line",
    question_ru: "Структура GMV по продуктовым линиям (доли)",
    sql: `SELECT pl.name AS product_line, round(sum(o.gmv)) AS gmv,
                 round(100.0*sum(o.gmv)/sum(sum(o.gmv)) OVER(),1) AS pct
          FROM orders o JOIN product_lines pl USING(product_line_id)
          WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "order_status_dist",
    question_ru: "Доли статусов заказов (completed/cancelled/refunded/disputed)",
    sql: `SELECT status, count(*) AS n, round(100.0*count(*)/sum(count(*)) OVER(),1) AS pct
          FROM orders GROUP BY 1 ORDER BY 2 DESC`,
  },

  // --- Отток (customers, churn_reasons) ---
  {
    id: "churn_rate_formal",
    question_ru: "Формальный отток: доля клиентов с проставленной датой ухода",
    sql: `SELECT count(*) FILTER(WHERE churn_date IS NOT NULL) AS churned,
                 count(*) AS total,
                 round(100.0*count(*) FILTER(WHERE churn_date IS NOT NULL)/count(*),1) AS churn_pct
          FROM customers`,
  },
  {
    id: "churn_reasons",
    question_ru: "Причины оттока клиентов (структура)",
    sql: `SELECT primary_reason, count(*) AS n,
                 round(100.0*count(*)/sum(count(*)) OVER(),1) AS pct
          FROM churn_reasons GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "ai_threat",
    question_ru: "Угроза AI-конкурентов: доля ушедших из-за AI-альтернатив",
    sql: `SELECT count(*) FILTER(WHERE primary_reason='ai_alternative') AS ai_churned,
                 count(*) AS total_churned,
                 round(100.0*count(*) FILTER(WHERE primary_reason='ai_alternative')/count(*),1) AS ai_pct
          FROM churn_reasons`,
  },
  {
    id: "economic_churn_dormant",
    question_ru: "Экономический отток: динамика доли спящих (dormant) клиентов по годам — кто на балансе, но перестал заказывать (vs формальный отток)",
    sql: `SELECT year(month) AS year,
                 round(100.0*count(*) FILTER(WHERE status='dormant')/count(*),1) AS dormant_pct,
                 round(100.0*count(*) FILTER(WHERE status='churning')/count(*),1) AS churning_pct,
                 round(100.0*count(*) FILTER(WHERE status='active')/count(*),1) AS active_pct
          FROM customer_activity_monthly GROUP BY 1 ORDER BY 1`,
  },

  {
    id: "best_month_ambiguous",
    question_ru: "«Лучший месяц/период» БЕЗ указанной метрики (неоднозначно): лучший месяц по РАЗНЫМ критериям — выручка, GMV, EBITDA — чтобы показать варианты и предложить уточнить критерий",
    sql: `SELECT критерий, месяц, значение FROM (
            (SELECT 'чистая выручка' AS критерий, strftime(month,'%Y-%m') AS месяц, round(revenue_net) AS значение FROM financials_monthly ORDER BY revenue_net DESC LIMIT 1)
            UNION ALL (SELECT 'GMV (оборот)', strftime(month,'%Y-%m'), round(gmv) FROM financials_monthly ORDER BY gmv DESC LIMIT 1)
            UNION ALL (SELECT 'EBITDA', strftime(month,'%Y-%m'), round(ebitda) FROM financials_monthly ORDER BY ebitda DESC LIMIT 1)
          ) t`,
  },

  // --- Юнит-экономика (unit_economics_monthly, последний месяц) ---
  {
    id: "ltv_cac_by_segment",
    question_ru: "LTV/CAC по сегментам (где привлечение убыточно)",
    sql: `SELECT segment, round(avg(ltv_12m)/avg(cac),2) AS ltv_cac
          FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "payback_by_segment",
    question_ru: "Срок окупаемости привлечения (payback) по сегментам",
    sql: `SELECT segment, round(avg(payback_months),1) AS payback_months
          FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1 ORDER BY 2`,
  },
  {
    id: "margin_by_category",
    question_ru: "Валовая маржа по категориям продуктовых линий (high/mid/low)",
    sql: `SELECT pl.category, round(avg(ue.gross_margin_pct),3) AS gross_margin
          FROM unit_economics_monthly ue JOIN product_lines pl USING(product_line_id)
          GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "margin_by_product_line",
    question_ru: "Прибыльность (валовая маржа) по продуктовым линиям — какая линия самая прибыльная",
    sql: `SELECT pl.name AS product_line, round(avg(ue.gross_margin_pct),3) AS gross_margin
          FROM unit_economics_monthly ue JOIN product_lines pl USING(product_line_id)
          GROUP BY 1 ORDER BY 2 DESC`,
  },

  // --- NPS (nps_responses, +срезы) ---
  {
    id: "nps_overall",
    question_ru: "NPS в целом (% промоутеров − % детракторов) и структура",
    sql: `SELECT round(100.0*(count(*) FILTER(WHERE category='promoter')
                            - count(*) FILTER(WHERE category='detractor'))/count(*),1) AS nps,
                 round(100.0*count(*) FILTER(WHERE category='promoter')/count(*),1) AS promoters_pct,
                 round(100.0*count(*) FILTER(WHERE category='passive')/count(*),1) AS passives_pct,
                 round(100.0*count(*) FILTER(WHERE category='detractor')/count(*),1) AS detractors_pct
          FROM nps_responses`,
  },
  {
    id: "nps_by_product_line",
    question_ru: "NPS по продуктовым линиям (где ниже всего)",
    sql: `SELECT pl.name AS product_line,
                 round(100.0*(count(*) FILTER(WHERE n.category='promoter')
                            - count(*) FILTER(WHERE n.category='detractor'))/count(*),1) AS nps
          FROM nps_responses n JOIN product_lines pl USING(product_line_id)
          GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "nps_by_segment",
    question_ru: "NPS по сегментам клиентов (перекос/смещение)",
    sql: `SELECT c.segment,
                 round(100.0*(count(*) FILTER(WHERE n.category='promoter')
                            - count(*) FILTER(WHERE n.category='detractor'))/count(*),1) AS nps
          FROM nps_responses n JOIN customers c USING(customer_id)
          GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "nps_bias_trend",
    question_ru: "Смещение NPS: динамика по годам с композицией (NPS, доли детракторов/промоутеров, объём ответов) — реальный рост или за счёт ухода недовольных",
    sql: `SELECT year(response_date) AS year,
                 round(100.0*(count(*) FILTER(WHERE category='promoter')
                            - count(*) FILTER(WHERE category='detractor'))/count(*),1) AS nps,
                 round(100.0*count(*) FILTER(WHERE category='detractor')/count(*),1) AS detractors_pct,
                 round(100.0*count(*) FILTER(WHERE category='promoter')/count(*),1) AS promoters_pct,
                 count(*) AS responses
          FROM nps_responses GROUP BY 1 ORDER BY 1`,
  },

  // --- Вовлечённость, клиенты ---
  {
    id: "activity_status_dist",
    question_ru: "Вовлечённость: распределение статусов активности клиентов",
    sql: `SELECT status, round(100.0*count(*)/sum(count(*)) OVER(),1) AS pct
          FROM customer_activity_monthly GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "industries_top",
    question_ru: "Отрасли клиентов по количеству",
    sql: `SELECT industry, count(*) AS customers FROM customers GROUP BY 1 ORDER BY 2 DESC`,
  },
];

export function findMetric(id: string): Metric | undefined {
  return METRICS.find((m) => m.id === id);
}
