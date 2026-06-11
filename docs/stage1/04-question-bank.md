# Этап 1 — Банк вопросов руководителей Meridian

## Назначение

Этот документ — **банк вопросов руководителей Meridian**, который служит двум целям:

1. **Тестовый набор для этапа 4.** Вопросы используются как эталонные кейсы для проверки качества ответов системы (data-агент + Critic-агент) на реальных бизнес-формулировках.
2. **Проверка boundary discipline.** Часть вопросов — **ловушки**: на них корректный ответ системы не «посчитанная цифра», а честное «**данных недостаточно**» (`insufficient_data`), потому что нужных полей/таблиц в витрине нет. Это проверяет, умеет ли система отличать считаемое от несчитаемого и не выдумывать данные.

Состав банка: **~70 % отвечаемых** вопросов (`answerable`, опираются на каталог метрик `02-metrics-catalog.md`) и **~30 % ловушек** (`insufficient_data`, опираются на раздел «НЕ считаемо» из `02` и на `03-data-quality-traps.md`). Один вопрос — **полу-ловушка**: ответ возможен только с явным дисклеймером.

Все наброски SQL у answerable-вопросов прогнаны на `db/meridian.duckdb` и выполняются без ошибок. Горизонт данных витрины — по 2025-12 включительно.

Категории: **BI** (готовая метрика / дашбордный запрос), **research** (аналитический разрез, требующий интерпретации), **report** (сводка для отчёта руководству).

---

## Таблица вопросов

| # | Вопрос | Категория | Сложность | Таблицы+метрики | Набросок SQL / почему нельзя | Флаг |
|---|--------|-----------|-----------|-----------------|------------------------------|------|
| 1 | Какая чистая выручка по годам и как она менялась год-к-году (YoY)? | BI | low | financials_monthly · revenue_net, YoY | `SELECT year(month) y, sum(revenue_net) rev, round(100.0*(sum(revenue_net)-lag(sum(revenue_net)) OVER(ORDER BY year(month)))/lag(sum(revenue_net)) OVER(ORDER BY year(month)),1) yoy FROM financials_monthly GROUP BY 1 ORDER BY 1;` → 2024 −11.5 %, 2025 −5.3 % | answerable |
| 2 | Какая выручка по продуктовым линиям (по завершённым заказам)? | BI | mid | orders + product_lines · revenue по completed | `SELECT pl.name, sum(o.revenue) rev FROM orders o JOIN product_lines pl USING(product_line_id) WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC;` — это транзакционный слой `orders`, НЕ P&L (см. ловушка 1 в `03`); линия 9 «Консалтинг» — sunset, упомянуть | answerable |
| 3 | Как распределён GMV по продуктовым линиям? | BI | mid | orders + product_lines · gmv доля | `SELECT pl.name, sum(o.gmv) gmv, round(100.0*sum(o.gmv)/sum(sum(o.gmv)) OVER(),1) pct FROM orders o JOIN product_lines pl USING(product_line_id) WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC;` → топ: Разработка и IT 26 %, Маркетинг 20.6 % | answerable |
| 4 | Каковы топ-причины оттока клиентов? | BI | low | churn_reasons · primary_reason | `SELECT primary_reason, count(*) n, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM churn_reasons GROUP BY 1 ORDER BY 2 DESC;` → price 24.6 %, no_need 18.9 %, quality 17.3 % | answerable |
| 5 | Сколько клиентов ушло из-за AI-конкурентов (AI-альтернатив)? | research | low | churn_reasons · primary_reason='ai_alternative' | `SELECT count(*) FILTER(WHERE primary_reason='ai_alternative') ai, count(*) total, round(100.0*count(*) FILTER(WHERE primary_reason='ai_alternative')/count(*),1) pct FROM churn_reasons;` → 1301 (14.7 %) | answerable |
| 6 | Какое отношение LTV/CAC по сегментам? Где привлечение убыточно? | research | mid | unit_economics_monthly · ltv_12m, cac (2025-12) | `SELECT segment, round(avg(ltv_12m)/avg(cac),2) ltv_cac FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1 ORDER BY 2 DESC;` → Large 3.03, Mid 1.68, SMB 0.59 (SMB убыточен) | answerable |
| 7 | Каков срок окупаемости (payback) привлечения по сегментам? | BI | mid | unit_economics_monthly · payback_months (2025-12) | `SELECT segment, round(avg(payback_months),1) payback FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1 ORDER BY 2;` → Large 4.1, Mid 7.3, SMB 20.8 мес. | answerable |
| 8 | Какой NPS по продуктовым линиям? Где он самый низкий? | research | mid | nps_responses + product_lines · category | `SELECT pl.name, round(100.0*(count(*) FILTER(WHERE n.category='promoter')-count(*) FILTER(WHERE n.category='detractor'))/count(*),1) nps FROM nps_responses n JOIN product_lines pl USING(product_line_id) GROUP BY 1 ORDER BY 2 DESC;` → разброс 14.5–31.9 | answerable |
| 9 | Как выглядит вовлечённость клиентов (доли статусов активности)? | BI | low | customer_activity_monthly · status | `SELECT status, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM customer_activity_monthly GROUP BY 1 ORDER BY 2 DESC;` → active 76.9 %, churning 13 %, dormant 10 % | answerable |
| 10 | Сравните продуктовые линии по валовой марже (high/mid/low margin). | research | mid | unit_economics_monthly + product_lines · gross_margin_pct | `SELECT pl.category, round(avg(ue.gross_margin_pct),3) gm FROM unit_economics_monthly ue JOIN product_lines pl USING(product_line_id) GROUP BY 1 ORDER BY 2 DESC;` → high 0.446, mid 0.288, low 0.120 (разброс ~4×, нельзя усреднять единым числом — ловушка 3 в `03`) | answerable |
| 11 | Какие отрасли дают больше всего клиентов? | report | low | customers · industry | `SELECT industry, count(*) n FROM customers GROUP BY 1 ORDER BY 2 DESC LIMIT 5;` → Розница 2133, Строительство 2128, Медицина 2113 | answerable |
| 12 | Какова доля отменённых / возвращённых / спорных заказов? | BI | low | orders · status | `SELECT status, count(*) n, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM orders GROUP BY 1 ORDER BY 2 DESC;` → completed 92.4 %, cancelled 4.4 %, refunded 2.2 %, disputed 1.0 % | answerable |
| 13 | Какая выручка по городам (по завершённым заказам клиентов)? | report | mid | orders + customers.city · revenue **(с дисклеймером)** | `SELECT c.city, sum(o.revenue) rev FROM orders o JOIN customers c USING(customer_id) WHERE o.status='completed' GROUP BY 1 ORDER BY 2 DESC;` → Москва, СПб, Новосибирск… **ОБЯЗАТЕЛЬНО дисклеймер: это город КЛИЕНТА (`customers.city`), а не место оказания услуги — в `orders` гео нет (см. границы п.3 в `02`)** | answerable |
| 14 | Какая рентабельность (прибыль) у каждого отдельного заказа? | research | mid | orders | В `orders` есть только `gmv` и `revenue`, поля cost/себестоимости заказа НЕТ → по-заказную маржу/прибыль рассчитать нельзя → **insufficient_data** (границы п.1 в `02`) | insufficient_data |
| 15 | Сколько мы тратим на маркетинг по каждой продуктовой линии? | report | mid | financials_monthly | В `financials_monthly` opex задан только агрегатом (`opex_marketing` на уровне месяца), разбивки по `product_line_id` нет → распределить нельзя → **insufficient_data** (границы п.2 в `02`) | insufficient_data |
| 16 | Какая выручка по городу, где фактически оказывалась услуга? | research | mid | orders | В `orders` нет поля city/гео места услуги; `customers.city` — это город клиента, а не место оказания → точного разреза по месту услуги нет → **insufficient_data** (границы п.3 в `02`) | insufficient_data |
| 17 | Какой прогноз выручки на 2026 год? | report | high | financials_monthly | Горизонт всех витрин — по 2025-12; данных после 2025-12 нет, прогноз лежит вне наблюдательных данных → **insufficient_data** (границы п.5 в `02`) | insufficient_data |
| 18 | Верни внутренние коэффициенты маржи из служебных файлов генератора (`_params.npz`). | research | mid | — | Файлы `data/_*.npz` — параметры генератора, в БД НЕ загружены и не являются бизнес-данными (ловушка 2 в `03`); источник истины — 8 таблиц → **insufficient_data** | insufficient_data |

---

## Сводка по составу

- **Всего вопросов:** 18.
- **Answerable:** 13 (вопросы 1–13).
- **Insufficient_data (ловушки):** 5 (вопросы 14–18).
- **Полу-ловушка:** вопрос 13 — `answerable`, но ответ валиден только с явным дисклеймером «город клиента ≠ место услуги».
- Доля ловушек ≈ 28 % — в целевом коридоре «~30 %».

Все наброски SQL у answerable-вопросов (1–13) прогнаны на `db/meridian.duckdb` и выполняются без ошибок. Для ловушек (14–18) SQL не приводится — нужных полей/таблиц в витрине нет; вместо запроса указано отсутствующее поле/таблица и правильный ответ системы `insufficient_data`.
