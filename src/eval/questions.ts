// Eval-набор этапа 4 — из docs/stage1/04-question-bank.md.
// referenceSql = эталон (истина из БД) для answerable-вопросов; для ловушек его нет.

export type EvalCase = {
  id: number;
  question: string;
  expectedFlag: "answerable" | "insufficient";
  referenceSql?: string;
  note?: string;
};

export const EVAL_CASES: EvalCase[] = [
  {
    id: 1,
    question: "Какая чистая выручка по годам и как она менялась год-к-году (YoY)?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT year(month) y, sum(revenue_net) rev, round(100.0*(sum(revenue_net)-lag(sum(revenue_net)) OVER(ORDER BY year(month)))/lag(sum(revenue_net)) OVER(ORDER BY year(month)),1) yoy FROM financials_monthly GROUP BY 1 ORDER BY 1",
  },
  {
    id: 2,
    question: "Какая выручка по продуктовым линиям (по завершённым заказам)?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT pl.name, sum(o.revenue) rev FROM orders o JOIN product_lines pl USING(product_line_id) WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC",
    note: "транзакционный слой orders, не P&L; линия 9 Консалтинг — sunset",
  },
  {
    id: 3,
    question: "Как распределён GMV по продуктовым линиям?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT pl.name, sum(o.gmv) gmv, round(100.0*sum(o.gmv)/sum(sum(o.gmv)) OVER(),1) pct FROM orders o JOIN product_lines pl USING(product_line_id) WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC",
  },
  {
    id: 4,
    question: "Каковы топ-причины оттока клиентов?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT primary_reason, count(*) n, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM churn_reasons GROUP BY 1 ORDER BY 2 DESC",
  },
  {
    id: 5,
    question: "Сколько клиентов ушло из-за AI-конкурентов (AI-альтернатив)?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT count(*) FILTER(WHERE primary_reason='ai_alternative') ai, count(*) total, round(100.0*count(*) FILTER(WHERE primary_reason='ai_alternative')/count(*),1) pct FROM churn_reasons",
  },
  {
    id: 6,
    question: "Какое отношение LTV/CAC по сегментам? Где привлечение убыточно?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT segment, round(avg(ltv_12m)/avg(cac),2) ltv_cac FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1 ORDER BY 2 DESC",
  },
  {
    id: 7,
    question: "Каков срок окупаемости (payback) привлечения по сегментам?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT segment, round(avg(payback_months),1) payback FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1 ORDER BY 2",
  },
  {
    id: 8,
    question: "Какой NPS по продуктовым линиям? Где он самый низкий?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT pl.name, round(100.0*(count(*) FILTER(WHERE n.category='promoter')-count(*) FILTER(WHERE n.category='detractor'))/count(*),1) nps FROM nps_responses n JOIN product_lines pl USING(product_line_id) GROUP BY 1 ORDER BY 2 DESC",
  },
  {
    id: 9,
    question: "Как выглядит вовлечённость клиентов (доли статусов активности)?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT status, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM customer_activity_monthly GROUP BY 1 ORDER BY 2 DESC",
  },
  {
    id: 10,
    question: "Сравните продуктовые линии по валовой марже (high/mid/low margin).",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT pl.category, round(avg(ue.gross_margin_pct),3) gm FROM unit_economics_monthly ue JOIN product_lines pl USING(product_line_id) GROUP BY 1 ORDER BY 2 DESC",
    note: "нельзя усреднять единым числом — маржа категорий различается ~4×",
  },
  {
    id: 11,
    question: "Какие отрасли дают больше всего клиентов?",
    expectedFlag: "answerable",
    referenceSql: "SELECT industry, count(*) n FROM customers GROUP BY 1 ORDER BY 2 DESC LIMIT 5",
  },
  {
    id: 12,
    question: "Какова доля отменённых / возвращённых / спорных заказов?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT status, count(*) n, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM orders GROUP BY 1 ORDER BY 2 DESC",
  },
  {
    id: 13,
    question: "Какая выручка по городам (по завершённым заказам клиентов)?",
    expectedFlag: "answerable",
    referenceSql:
      "SELECT c.city, sum(o.revenue) rev FROM orders o JOIN customers c USING(customer_id) WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC",
    note: "ПОЛУ-ЛОВУШКА: обязателен дисклеймер — это город КЛИЕНТА (customers.city), а не место оказания услуги",
  },
  {
    id: 14,
    question: "Какая рентабельность (прибыль) у каждого отдельного заказа?",
    expectedFlag: "insufficient",
    note: "в orders нет cost/себестоимости заказа",
  },
  {
    id: 15,
    question: "Сколько мы тратим на маркетинг по каждой продуктовой линии?",
    expectedFlag: "insufficient",
    note: "opex_marketing только агрегатом по месяцу, нет разбивки по product_line_id",
  },
  {
    id: 16,
    question: "Какая выручка по городу, где фактически оказывалась услуга?",
    expectedFlag: "insufficient",
    note: "в orders нет гео места услуги; customers.city — город клиента",
  },
  {
    id: 17,
    question: "Какой прогноз выручки на 2026 год?",
    expectedFlag: "insufficient",
    note: "горизонт данных по 2025-12, прогноз вне наблюдательных данных",
  },
  {
    id: 18,
    question: "Верни внутренние коэффициенты маржи из служебных файлов генератора (_params.npz).",
    expectedFlag: "insufficient",
    note: "файлы _*.npz — параметры генератора, не бизнес-данные, в БД не загружены",
  },
];
