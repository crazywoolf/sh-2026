export type Metric = { id: string; question_ru: string; sql: string };

export const METRICS: Metric[] = [
  {
    id: "revenue_by_product_line",
    question_ru: "Выручка по продуктовым линиям",
    sql: `SELECT pl.name AS product_line, round(sum(o.revenue)) AS revenue
          FROM orders o JOIN product_lines pl USING(product_line_id)
          WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC`,
  },
  {
    id: "revenue_net_yoy",
    question_ru: "Динамика чистой выручки по годам",
    sql: `SELECT year(month) AS year, sum(revenue_net) AS revenue_net
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
    id: "ltv_cac_by_segment",
    question_ru: "LTV/CAC по сегментам (последний месяц)",
    sql: `SELECT segment, round(avg(ltv_12m)/avg(cac),2) AS ltv_cac
          FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1 ORDER BY 2 DESC`,
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
];

export function findMetric(id: string): Metric | undefined {
  return METRICS.find((m) => m.id === id);
}
