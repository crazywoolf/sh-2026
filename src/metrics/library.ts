export type Metric = { id: string; question_ru: string; sql: string };

export const METRICS: Metric[] = [
  {
    id: "revenue_by_product_line",
    question_ru: "Выручка по продуктовым линиям (по завершённым заказам)",
    sql: `SELECT pl.name AS product_line, round(sum(o.revenue)) AS revenue
          FROM orders o JOIN product_lines pl USING(product_line_id)
          WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "gmv_by_product_line",
    question_ru: "Распределение GMV по продуктовым линиям",
    sql: `SELECT pl.name AS product_line, round(sum(o.gmv)) AS gmv,
                 round(100.0*sum(o.gmv)/sum(sum(o.gmv)) OVER(),1) AS pct
          FROM orders o JOIN product_lines pl USING(product_line_id)
          WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "revenue_net_yoy",
    question_ru: "Динамика чистой выручки по годам (YoY)",
    sql: `SELECT year(month) AS year, sum(revenue_net) AS revenue_net,
                 round(100.0*(sum(revenue_net)-lag(sum(revenue_net)) OVER(ORDER BY year(month)))
                       /lag(sum(revenue_net)) OVER(ORDER BY year(month)),1) AS yoy_pct
          FROM financials_monthly GROUP BY 1 ORDER BY 1`,
  },
  {
    id: "churn_reasons",
    question_ru: "Причины оттока клиентов",
    sql: `SELECT primary_reason, count(*) AS n,
                 round(100.0*count(*)/sum(count(*)) OVER(),1) AS pct
          FROM churn_reasons GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "ai_alternative_churn",
    question_ru: "Сколько клиентов ушло из-за AI-альтернатив",
    sql: `SELECT count(*) FILTER(WHERE primary_reason='ai_alternative') AS ai_churn,
                 count(*) AS total_churn,
                 round(100.0*count(*) FILTER(WHERE primary_reason='ai_alternative')/count(*),1) AS pct
          FROM churn_reasons`,
  },
  {
    id: "ltv_cac_by_segment",
    question_ru: "LTV, CAC и отношение LTV/CAC по сегментам (последний месяц)",
    sql: `SELECT segment, round(avg(cac)) AS cac, round(avg(ltv_12m)) AS ltv_12m,
                 round(avg(ltv_12m)/avg(cac),2) AS ltv_cac
          FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1 ORDER BY 4 DESC`,
  },
  {
    id: "payback_by_segment",
    question_ru: "Срок окупаемости привлечения (payback) по сегментам",
    sql: `SELECT segment, round(avg(payback_months),1) AS payback_months
          FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1 ORDER BY 2`,
  },
  {
    id: "margin_by_category",
    question_ru: "Валовая маржа по категориям продуктовых линий (high/mid/low margin)",
    sql: `SELECT pl.category, round(avg(ue.gross_margin_pct),3) AS gross_margin
          FROM unit_economics_monthly ue JOIN product_lines pl USING(product_line_id)
          GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "nps_by_product_line",
    question_ru: "NPS по продуктовым линиям",
    sql: `SELECT pl.name AS product_line,
                 round(100.0*(count(*) FILTER(WHERE n.category='promoter')
                            - count(*) FILTER(WHERE n.category='detractor'))/count(*),1) AS nps
          FROM nps_responses n JOIN product_lines pl USING(product_line_id)
          GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "activity_status_shares",
    question_ru: "Вовлечённость клиентов: доли статусов активности",
    sql: `SELECT status, round(100.0*count(*)/sum(count(*)) OVER(),1) AS pct
          FROM customer_activity_monthly GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "top_industries",
    question_ru: "Отрасли с наибольшим числом клиентов",
    sql: `SELECT industry, count(*) AS clients FROM customers GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
  },
  {
    id: "order_status_shares",
    question_ru: "Доли заказов по статусам (отменённые/возвращённые/спорные)",
    sql: `SELECT status, count(*) AS n, round(100.0*count(*)/sum(count(*)) OVER(),1) AS pct
          FROM orders GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "revenue_by_city",
    question_ru: "Выручка по городам клиентов (внимание: город КЛИЕНТА, не место услуги)",
    sql: `SELECT c.city, round(sum(o.revenue)) AS revenue
          FROM orders o JOIN customers c USING(customer_id)
          WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
  },
];

export function findMetric(id: string): Metric | undefined {
  return METRICS.find((m) => m.id === id);
}
