# Каталог метрик Meridian (этап 1)

Рабочий набор из 18 ключевых метрик, отобранных под легенду кейса «Meridian»: падение выручки на фоне растущего GMV, высокий отток клиентов (по легенде ~23 % в год), уход части клиентов к AI-конкурентам и проблемная юнит-экономика в нижних сегментах. Каждая метрика снабжена формулой, рабочим SQL-запросом к `db/meridian.duckdb`, указанием источника/гранулярности и наблюдением, рассчитанным напрямую из данных витрины.

Горизонт данных витрины: по 2025-12 включительно. Все запросы выполняются через `duckdb db/meridian.duckdb -c "..."` из корня репозитория.

---

## Блок A. P&L

### 1. Выручка net и gross по годам
- **Определение / Формула:** Годовая сумма чистой (`revenue_net`) и валовой (`revenue_gross`) выручки из помесячной финотчётности.
- **SQL:** `SELECT year(month) y, sum(revenue_net) rev_net, sum(revenue_gross) rev_gross FROM financials_monthly GROUP BY 1 ORDER BY 1;`
- **Источник:** financials_monthly.revenue_net, revenue_gross · **Гранулярность:** год (агрегация помесячных строк).
- **Наблюдение:** Выручка net падает три года подряд: 2023 — 8,064 млрд → 2024 — 7,133 млрд → 2025 — 6,756 млрд. Gross идёт параллельно (8,248 / 7,334 / 6,983 млрд). Нисходящий тренд подтверждает легенду о падении выручки.

### 2. GMV по годам
- **Определение / Формула:** Годовой совокупный валовой оборот платформы (`gmv`).
- **SQL:** `SELECT year(month) y, sum(gmv) gmv FROM financials_monthly GROUP BY 1 ORDER BY 1;`
- **Источник:** financials_monthly.gmv · **Гранулярность:** год.
- **Наблюдение:** GMV, наоборот, растёт: 2023 — 119,91 млрд → 2024 — 139,27 млрд → 2025 — 164,91 млрд. Ключевая «вилка»: оборот через платформу увеличивается, а выручка компании падает — то есть монетизация оборота ухудшается.

### 3. Take rate = revenue_gross / gmv
- **Определение / Формула:** Эффективная ставка монетизации оборота. В витрине хранится готовым полем `take_rate`; смысловая формула — `revenue_gross / gmv`.
- **SQL:** `SELECT round(min(take_rate),5) min_tr, round(max(take_rate),5) max_tr, round(avg(take_rate),5) avg_tr FROM financials_monthly;`
- **Источник:** financials_monthly.take_rate (≈ revenue_gross/gmv) · **Гранулярность:** месяц (здесь — агрегаты по всем месяцам).
- **Наблюдение:** Take rate варьируется от 0,04018 до 0,07813 при среднем 0,05469 (~5,5 %). Размах ставки (4,0 %–7,8 %) — прямое объяснение «вилки» из метрики 2: при растущем GMV снижение take rate утягивает выручку вниз.

### 4. EBITDA-маржа = ebitda / revenue_net
- **Определение / Формула:** Отношение EBITDA к чистой выручке за месяц.
- **SQL:** `SELECT month, round(ebitda/revenue_net,3) ebitda_margin FROM financials_monthly ORDER BY month DESC LIMIT 3;`
- **Источник:** financials_monthly.ebitda, revenue_net · **Гранулярность:** месяц.
- **Наблюдение:** В последних месяцах EBITDA-маржа отрицательна и ухудшается по мере приближения к концу горизонта: 2025-10 — −0,319, 2025-11 — −0,269, 2025-12 — −0,225. Компания убыточна на уровне EBITDA в конце периода (наблюдение фиксируется как есть, без корректировки).

### 5. Динамика выручки YoY
- **Определение / Формула:** Год-к-году изменение чистой выручки: `(rev_t − rev_{t-1}) / rev_{t-1} × 100`.
- **SQL:** `SELECT year(month) y, round(100.0*(sum(revenue_net)-lag(sum(revenue_net)) OVER(ORDER BY year(month)))/lag(sum(revenue_net)) OVER(ORDER BY year(month)),1) yoy FROM financials_monthly GROUP BY year(month) ORDER BY y;`
- **Источник:** financials_monthly.revenue_net · **Гранулярность:** год.
- **Наблюдение:** 2024 vs 2023 — −11,5 %; 2025 vs 2024 — −5,3 %. Выручка падает оба года; темп падения замедлился, но тренд остаётся отрицательным.

---

## Блок B. Юнит-экономика (срез segment × product_line, unit_economics_monthly, на 2025-12)

### 6. CAC (стоимость привлечения клиента)
- **Определение / Формула:** Средняя стоимость привлечения клиента по всем срезам segment × product_line за месяц.
- **SQL:** `SELECT round(avg(cac)) cac FROM unit_economics_monthly WHERE month='2025-12-01';`
- **Источник:** unit_economics_monthly.cac · **Гранулярность:** месяц × segment × product_line (здесь — среднее по срезам за 2025-12).
- **Наблюдение:** Средний CAC на 2025-12 — 28 785 (в денежных единицах витрины).

### 7. LTV 12m (пожизненная ценность за 12 мес.)
- **Определение / Формула:** Средняя 12-месячная пожизненная ценность клиента по срезам.
- **SQL:** `SELECT round(avg(ltv_12m)) ltv FROM unit_economics_monthly WHERE month='2025-12-01';`
- **Источник:** unit_economics_monthly.ltv_12m · **Гранулярность:** месяц × segment × product_line (среднее по срезам за 2025-12).
- **Наблюдение:** Средний LTV 12m на 2025-12 — 72 018.

### 8. LTV / CAC
- **Определение / Формула:** Отношение пожизненной ценности к стоимости привлечения; здоровым считается ≥ 3.
- **SQL:** `SELECT round(avg(ltv_12m)/avg(cac),2) ltv_cac FROM unit_economics_monthly WHERE month='2025-12-01';`
- **Источник:** unit_economics_monthly.ltv_12m, cac · **Гранулярность:** месяц × segment × product_line.
- **Наблюдение:** В среднем LTV/CAC = 2,5 — ниже порога здоровья (3,0). В разрезе сегментов на 2025-12: Large — 3,03 (здоров), Mid — 1,68, SMB — 0,59 (привлечение SMB убыточно). Срез `SELECT segment, round(avg(ltv_12m)/avg(cac),2) ltv_cac FROM unit_economics_monthly WHERE month='2025-12-01' GROUP BY 1;` показывает, что проблема юнит-экономики сосредоточена в SMB и Mid.

### 9. Payback (срок окупаемости, мес.)
- **Определение / Формула:** Среднее число месяцев до окупаемости затрат на привлечение.
- **SQL:** `SELECT round(avg(payback_months),1) payback FROM unit_economics_monthly WHERE month='2025-12-01';`
- **Источник:** unit_economics_monthly.payback_months · **Гранулярность:** месяц × segment × product_line.
- **Наблюдение:** Средний payback на 2025-12 — 10,8 мес. Длинный срок окупаемости усиливает риск при оттоке: значительная часть клиентов рискует уйти до выхода в плюс.

### 10. Gross margin %
- **Определение / Формула:** Средняя валовая маржа по срезам (доля).
- **SQL:** `SELECT round(avg(gross_margin_pct),3) gm FROM unit_economics_monthly WHERE month='2025-12-01';`
- **Источник:** unit_economics_monthly.gross_margin_pct · **Гранулярность:** месяц × segment × product_line.
- **Наблюдение:** Средняя валовая маржа на 2025-12 — 0,254 (~25,4 %). Невысокая маржа ограничивает запас прочности на покрытие opex (см. отрицательную EBITDA-маржу в метрике 4).

---

## Блок C. Отток

### 11. Lifetime churn share (доля ушедших клиентов)
- **Определение / Формула:** Доля клиентов с непустым `churn_date` от общего числа клиентов.
- **SQL:** `SELECT round(100.0*count(*) FILTER(WHERE churn_date IS NOT NULL)/count(*),1) churn_pct FROM customers;`
- **Источник:** customers.churn_date · **Гранулярность:** клиент (накопленная за всё время доля).
- **Наблюдение:** 35,5 % клиентов имеют дату оттока. Это накопленная (lifetime) доля за весь период наблюдения, а не годовой темп — поэтому она выше «~23 % в год» из легенды, которая описывает годовой churn rate.

### 12. Структура причин оттока (primary_reason)
- **Определение / Формула:** Распределение основной причины ухода по таблице интервью оттока.
- **SQL:** `SELECT primary_reason, count(*) n, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM churn_reasons GROUP BY 1 ORDER BY 2 DESC;`
- **Источник:** churn_reasons.primary_reason · **Гранулярность:** клиент (запись оттока).
- **Наблюдение:** price — 24,6 % (2185), no_need — 18,9 % (1679), quality — 17,3 % (1531), consolidation — 15,5 % (1374), ai_alternative — 14,7 % (1301), other — 9,0 % (803). Цена и отсутствие потребности лидируют; AI-альтернатива уже на пятом месте.

### 13. Доля ai_alternative в оттоке
- **Определение / Формула:** Доля записей оттока с причиной `ai_alternative`.
- **SQL:** `SELECT round(100.0*count(*) FILTER(WHERE primary_reason='ai_alternative')/count(*),1) ai_share FROM churn_reasons;`
- **Источник:** churn_reasons.primary_reason · **Гранулярность:** клиент (запись оттока).
- **Наблюдение:** 14,7 % ушедших называют AI-альтернативу основной причиной — прямой сигнал перетока клиентов к AI-конкурентам и материальная часть оттока.

---

## Блок D. Вовлечённость

### 14. Распределение activity.status
- **Определение / Формула:** Доли клиенто-месяцев по статусу активности.
- **SQL:** `SELECT status, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM customer_activity_monthly GROUP BY 1;`
- **Источник:** customer_activity_monthly.status · **Гранулярность:** клиент × месяц.
- **Наблюдение:** active — 76,9 %, churning — 13,0 %, dormant — 10,0 %, churned — 0,1 %. Около 23 % клиенто-месяцев в зоне риска (churning + dormant) — крупный пул для удержания.

### 15. Среднее login_count / days_active
- **Определение / Формула:** Среднее число логинов и активных дней на клиенто-месяц.
- **SQL:** `SELECT round(avg(login_count),1) avg_login, round(avg(days_active),1) avg_days FROM customer_activity_monthly;`
- **Источник:** customer_activity_monthly.login_count, days_active · **Гранулярность:** клиент × месяц.
- **Наблюдение:** В среднем 5,2 логина и 5,8 активных дня на клиенто-месяц — низкая интенсивность использования (около одной недели активности в месяц), что согласуется с рисками оттока.

---

## Блок E. NPS

### 16. NPS = %promoter − %detractor
- **Определение / Формула:** Net Promoter Score: доля промоутеров минус доля детракторов (в п.п.).
- **SQL:** `SELECT round(100.0*(count(*) FILTER(WHERE category='promoter') - count(*) FILTER(WHERE category='detractor'))/count(*),1) nps FROM nps_responses;`
- **Источник:** nps_responses.category · **Гранулярность:** ответ (response).
- **Наблюдение:** NPS = 24,8. Структура категорий: promoter — 46,0 %, passive — 32,8 %, detractor — 21,2 % (запрос `SELECT category, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM nps_responses GROUP BY 1;`). NPS положителен, но более пятой части респондентов — детракторы.

### 17. Структура comment_tag
- **Определение / Формула:** Распределение тематических тегов комментариев NPS.
- **SQL:** `SELECT comment_tag, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM nps_responses GROUP BY 1 ORDER BY 2 DESC;`
- **Источник:** nps_responses.comment_tag · **Гранулярность:** ответ (response).
- **Наблюдение:** nps_growth — 52,8 %, price — 16,0 %, quality — 15,4 %, support — 10,5 %, churn_intent — 2,9 %, ai_competitor — 2,5 %. Помимо позитива (рост), наиболее болезненные темы — цена и качество.

### 18. Доля тега ai_competitor (сигнал AI-угрозы)
- **Определение / Формула:** Доля ответов NPS с тегом `ai_competitor`.
- **SQL:** `SELECT round(100.0*count(*) FILTER(WHERE comment_tag='ai_competitor')/count(*),2) ai_pct FROM nps_responses;`
- **Источник:** nps_responses.comment_tag · **Гранулярность:** ответ (response).
- **Наблюдение:** 2,47 % ответов упоминают AI-конкурента — пока небольшая, но явно выраженная доля в обратной связи; вместе с 14,7 % AI-причин в оттоке (метрика 13) указывает на нарастающее давление AI-альтернатив.

---

## НЕ считаемо (границы данных)

1. **Себестоимость / маржа на уровне отдельного заказа.** В `orders` есть только `gmv` и `revenue`, но нет поля cost/себестоимости заказа — по-заказную валовую маржу рассчитать нельзя. Маржа доступна лишь агрегатами (`financials_monthly.cogs`, `unit_economics_monthly.gross_margin_pct`).
2. **Разбивка opex по каналам / продуктовым линиям.** В `financials_monthly` операционные расходы заданы только агрегатами `opex_marketing`, `opex_rnd`, `opex_admin` на уровне месяца — распределить их по `acquisition_channel` или `product_line_id` невозможно.
3. **Выручка по месту оказания услуги в городе.** В `orders` нет поля city; джойн на `customers.city` даёт город КЛИЕНТА, а не место оказания услуги — географический разрез выручки допустим только с явной оговоркой «город клиента».
4. **Причинно-следственные связи.** Данные наблюдательные, в витрине нет экспериментов / A-B-тестов — связи между факторами (например, AI-конкуренты → отток) можно показать как корреляцию/ассоциацию, но не как доказанную причинность.
5. **Любые данные после 2025-12.** Горизонт всех витрин ограничен декабрём 2025 (`financials_monthly`, `unit_economics_monthly`, `customer_activity_monthly` и др.) — прогнозы и фактические значения за 2026 и далее из этих данных не выводятся.
6. **Истинный годовой churn rate когорты.** В `customers` доступна только накопленная доля ушедших (lifetime, метрика 11); корректный годовой churn rate требует когортного знаменателя «активные на начало периода», которого нет в готовом виде — точное сопоставление с «~23 %/год» из легенды требует отдельной когортной реконструкции.
