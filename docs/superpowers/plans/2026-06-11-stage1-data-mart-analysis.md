# Этап 1 — Витрина Meridian в DuckDB + аналитика: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Загрузить 8 CSV витрины Meridian в файловую БД DuckDB и подготовить аналитические документы (схема БД, каталог метрик, ловушки качества, банк вопросов), где каждое утверждение подкреплено реальным, проверенным SQL.

**Architecture:** Один файл `db/meridian.duckdb`, собираемый идемпотентным SQL-загрузчиком через DuckDB CLI (Python в окружении сломан). Документы в `docs/stage1/` цитируют только цифры, полученные SQL-запросом к собранной БД. Бинарь БД в git не коммитим — пересобирается из CSV.

**Tech Stack:** DuckDB CLI (ставится `brew install duckdb`), SQL, Markdown, mermaid. Без Python/ноутбуков.

**Источники:** спека [../specs/2026-06-11-stage1-data-mart-analysis-design.md](../specs/2026-06-11-stage1-data-mart-analysis-design.md), [docs/data-dictionary.md](../../data-dictionary.md), 8 CSV в [data/](../../../data/). Уже готов `docs/stage1/01-data-map.md`.

**Принцип цитирования:** каждое число в документах получено SQL-запросом к `db/meridian.duckdb`. Цифры — только из данных, не из текста легенды кейса (их расхождения — материал для документа 03).

---

## Task 1: Сборка БД DuckDB (загрузчик + build + верификация)

**Files:**
- Create: `db/load.sql`, `db/build.sh`
- Modify: `.gitignore`
- Artifact (не в git): `db/meridian.duckdb`

- [ ] **Step 1: Установить DuckDB CLI**

Run:
```bash
which duckdb || brew install duckdb
duckdb --version
```
Expected: печатается версия (например `v1.x.x`). Если brew долго — дождаться.

- [ ] **Step 2: Написать `db/load.sql`**

Идемпотентный загрузчик. Содержимое:
```sql
-- Загрузка витрины Meridian из CSV в DuckDB. Идемпотентно (CREATE OR REPLACE).
-- Запускать из корня репозитория: duckdb db/meridian.duckdb < db/load.sql

CREATE OR REPLACE TABLE customers AS
SELECT * FROM read_csv_auto('data/customers.csv', header=true,
  types={'customer_id':'INTEGER','signup_date':'DATE','churn_date':'DATE'});

CREATE OR REPLACE TABLE product_lines AS
SELECT * FROM read_csv_auto('data/product_lines.csv', header=true,
  types={'product_line_id':'INTEGER','launch_date':'DATE'});

CREATE OR REPLACE TABLE orders AS
SELECT * FROM read_csv_auto('data/orders.csv', header=true,
  types={'order_id':'BIGINT','customer_id':'INTEGER','product_line_id':'INTEGER','order_date':'DATE'});

CREATE OR REPLACE TABLE nps_responses AS
SELECT * FROM read_csv_auto('data/nps_responses.csv', header=true,
  types={'response_id':'BIGINT','customer_id':'INTEGER','product_line_id':'INTEGER','response_date':'DATE'});

CREATE OR REPLACE TABLE customer_activity_monthly AS
SELECT * FROM read_csv_auto('data/customer_activity_monthly.csv', header=true,
  types={'customer_id':'INTEGER','month':'DATE'});

CREATE OR REPLACE TABLE churn_reasons AS
SELECT * FROM read_csv_auto('data/churn_reasons.csv', header=true,
  types={'customer_id':'INTEGER','churn_date':'DATE','interview_completed':'BOOLEAN'});

CREATE OR REPLACE TABLE financials_monthly AS
SELECT * FROM read_csv_auto('data/financials_monthly.csv', header=true,
  types={'month':'DATE'});

CREATE OR REPLACE TABLE unit_economics_monthly AS
SELECT * FROM read_csv_auto('data/unit_economics_monthly.csv', header=true,
  types={'month':'DATE','product_line_id':'INTEGER'});
```
Если DuckDB ругается на синтаксис `types={...}` для read_csv_auto в установленной версии — переключись на `read_csv(..., auto_detect=true, types={...})`. Проверь `DESCRIBE` (Step 4) и при необходимости поправь.

- [ ] **Step 3: Написать `db/build.sh`**

```bash
#!/usr/bin/env bash
# Сборка БД Meridian из CSV. Запуск: bash db/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # корень репозитория
duckdb db/meridian.duckdb < db/load.sql
echo "=== row counts ==="
duckdb db/meridian.duckdb -c "
SELECT 'customers' t, count(*) n FROM customers UNION ALL
SELECT 'product_lines', count(*) FROM product_lines UNION ALL
SELECT 'orders', count(*) FROM orders UNION ALL
SELECT 'nps_responses', count(*) FROM nps_responses UNION ALL
SELECT 'customer_activity_monthly', count(*) FROM customer_activity_monthly UNION ALL
SELECT 'churn_reasons', count(*) FROM churn_reasons UNION ALL
SELECT 'financials_monthly', count(*) FROM financials_monthly UNION ALL
SELECT 'unit_economics_monthly', count(*) FROM unit_economics_monthly
ORDER BY t;"
```

- [ ] **Step 4: Собрать БД и верифицировать объёмы + типы**

Run:
```bash
cd /Users/irinafrolova/Documents/sh26
rm -f db/meridian.duckdb
bash db/build.sh
duckdb db/meridian.duckdb -c "DESCRIBE orders; DESCRIBE customers;"
```
Expected row counts: customers 25000, product_lines 9, orders 681305, nps_responses 56164, customer_activity_monthly 608920, churn_reasons 8873, financials_monthly 36, unit_economics_monthly 918. В DESCRIBE: order_date/signup_date/churn_date — DATE; *_id — INTEGER/BIGINT. Любое расхождение объёмов — дефект (NULL/кодировка); разобраться.

- [ ] **Step 5: Игнорировать бинарь БД в git**

Добавить в `.gitignore` строки:
```
db/meridian.duckdb
db/*.duckdb.wal
```

- [ ] **Step 6: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add db/load.sql db/build.sh .gitignore
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: загрузка витрины Meridian в DuckDB (db/)"
```

---

## Task 2: `docs/stage1/00-database.md` — схема и использование БД

**Files:**
- Create: `docs/stage1/00-database.md`

- [ ] **Step 1: Извлечь схему и объёмы из собранной БД**

Run:
```bash
cd /Users/irinafrolova/Documents/sh26
for t in customers product_lines orders nps_responses customer_activity_monthly churn_reasons financials_monthly unit_economics_monthly; do
  echo "== $t =="; duckdb db/meridian.duckdb -c "DESCRIBE $t;";
done
```
Зафиксировать имена колонок и типы из вывода (это ground truth для документа).

- [ ] **Step 2: Написать `docs/stage1/00-database.md`** со структурой:
1. Заголовок + назначение: запрашиваемая БД витрины Meridian для агентов/EDA.
2. **Сборка:** `bash db/build.sh` (требует `duckdb` CLI; ставится `brew install duckdb`). Файл БД — `db/meridian.duckdb`, в git не коммитится, пересобирается из CSV.
3. **Запрос:** `duckdb db/meridian.duckdb -c "SELECT ..."` или интерактивно `duckdb db/meridian.duckdb`.
4. **8 таблиц** — короткая таблица: имя · объём строк · ключевые типы (даты/id из Step 1). Полные схемы — ссылка на `../data-dictionary.md`.
5. **3–5 примеров запросов** (рабочих) — напр.: выручка по продуктовым линиям; топ причин оттока; NPS по линиям. Каждый сопроводить тем, что он возвращает.

- [ ] **Step 3: Проверить, что примеры реально выполняются**

Run каждый пример из документа через `duckdb db/meridian.duckdb -c "<query>"`. Все должны вернуть результат без ошибок. Зафиксировать в отчёте.

- [ ] **Step 4: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add docs/stage1/00-database.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: документ по БД (00-database)"
```

---

## Task 3: Дополнить `01-data-map.md` заметкой о БД

**Files:**
- Modify: `docs/stage1/01-data-map.md`

- [ ] **Step 1: Добавить в начало (после вступления) короткий блок**
```markdown
> **Данные доступны как БД DuckDB** — собрать `bash db/build.sh`, запрашивать `duckdb db/meridian.duckdb -c "..."`. Подробности и примеры: [00-database.md](00-database.md).
```

- [ ] **Step 2: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add docs/stage1/01-data-map.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: ссылка на БД в карте витрины"
```

---

## Task 4: `docs/stage1/02-metrics-catalog.md` — каталог метрик с SQL

**Files:**
- Create: `docs/stage1/02-metrics-catalog.md`

- [ ] **Step 1: Посчитать опорные метрики SQL-ом (ground truth)**

Run (каждый запрос — `duckdb db/meridian.duckdb -c "..."` из корня репо):
```bash
cd /Users/irinafrolova/Documents/sh26
duckdb db/meridian.duckdb -c "SELECT year(month) y, sum(revenue_net) rev FROM financials_monthly GROUP BY 1 ORDER BY 1;"
duckdb db/meridian.duckdb -c "SELECT min(take_rate), max(take_rate) FROM financials_monthly;"
duckdb db/meridian.duckdb -c "SELECT round(100.0*count(*) FILTER(WHERE churn_date IS NOT NULL)/count(*),1) churn_pct FROM customers;"
duckdb db/meridian.duckdb -c "SELECT primary_reason, count(*) n, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM churn_reasons GROUP BY 1 ORDER BY 2 DESC;"
duckdb db/meridian.duckdb -c "SELECT round(100.0*count(*) FILTER(WHERE comment_tag='ai_competitor')/count(*),2) ai_pct FROM nps_responses;"
duckdb db/meridian.duckdb -c "SELECT round(avg(cac)) cac, round(avg(ltv_12m)) ltv, round(avg(ltv_12m)/avg(cac),2) ltv_cac, round(avg(payback_months),1) payback FROM unit_economics_monthly WHERE month='2025-12-01';"
duckdb db/meridian.duckdb -c "SELECT category, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM nps_responses GROUP BY 1;"
duckdb db/meridian.duckdb -c "SELECT round(100.0*(count(*) FILTER(WHERE category='promoter') - count(*) FILTER(WHERE category='detractor'))/count(*),1) nps FROM nps_responses;"
duckdb db/meridian.duckdb -c "SELECT status, round(100.0*count(*)/sum(count(*)) OVER(),1) pct FROM customer_activity_monthly GROUP BY 1;"
```
Использовать фактические числа из вывода. Ориентиры: revenue_net 2023≈8.06B/2024≈7.13B/2025≈6.76B; take_rate≈0.075–0.078; churn≈35.5%; ai_competitor≈2.5%; LTV/CAC≈2.50; promoter≈46%/detractor≈21%.

- [ ] **Step 2: Написать `docs/stage1/02-metrics-catalog.md`**

Вступление: рабочий набор ~18 метрик; у каждой формула, **рабочий SQL** к DuckDB, источник, наблюдение. Формат метрики:
```markdown
### <Название>
- **Определение / Формула:** ...
- **SQL:** `<запрос к db/meridian.duckdb>`
- **Источник:** <таблица>.<колонки> · **Гранулярность:** ...
- **Наблюдение:** <реальная цифра из Step 1>
```
Метрики (рабочий набор, по блокам):
- **P&L:** (1) Выручка net/gross; (2) GMV; (3) Take rate = revenue_gross/gmv; (4) EBITDA-маржа = ebitda/revenue_net; (5) Динамика выручки YoY (реальные %).
- **Юнит-экономика (срез segment×product_line из unit_economics_monthly):** (6) CAC; (7) LTV 12m; (8) LTV/CAC; (9) Payback; (10) Gross margin %.
- **Отток:** (11) Lifetime churn share; (12) Структура причин; (13) Доля ai_alternative.
- **Вовлечённость:** (14) Распределение activity.status; (15) Среднее login_count/days_active.
- **NPS:** (16) NPS = %promoter − %detractor; (17) Структура comment_tag; (18) Доля ai_competitor.

Раздел **«НЕ считаемо (границы данных)»** ≥4 пункта со ссылкой на отсутствие колонок: себестоимость на уровне заказа (в orders нет cost); opex по каналам/линиям (только агрегаты); выручка по месту оказания услуги (orders без city; джойн даёт город клиента — с оговоркой); причинность (наблюдательные данные); данные после 2025-12.

- [ ] **Step 3: Проверить, что каждый SQL выполняется**

Run: прогнать КАЖДЫЙ `SQL:` из документа через `duckdb db/meridian.duckdb -c "..."`. Все без ошибок, числа совпадают с «Наблюдение».
```bash
grep -c "Формула" docs/stage1/02-metrics-catalog.md   # >=18
```

- [ ] **Step 4: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add docs/stage1/02-metrics-catalog.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: каталог метрик с SQL (02-metrics-catalog)"
```

---

## Task 5: `docs/stage1/03-data-quality-traps.md` — ловушки с SQL-доказательством

**Files:**
- Create: `docs/stage1/03-data-quality-traps.md`

- [ ] **Step 1: Доказать ловушки SQL-ом (ground truth)**

Run:
```bash
cd /Users/irinafrolova/Documents/sh26
echo "== orders vs financials, Dec-2023 =="
duckdb db/meridian.duckdb -c "SELECT revenue_gross, gmv FROM financials_monthly WHERE month='2023-12-01';"
duckdb db/meridian.duckdb -c "SELECT sum(gmv) gmv, sum(revenue) rev FROM orders WHERE order_date>='2023-12-01' AND order_date<'2024-01-01' AND status='completed';"
echo "== nulls =="
duckdb db/meridian.duckdb -c "SELECT count(*) FILTER(WHERE churn_date IS NULL) active FROM customers;"
duckdb db/meridian.duckdb -c "SELECT count(*) FILTER(WHERE nps_at_churn IS NULL) FROM churn_reasons;"
duckdb db/meridian.duckdb -c "SELECT count(*) FILTER(WHERE competitor_named IS NULL OR competitor_named='') FROM churn_reasons;"
echo "== order statuses =="
duckdb db/meridian.duckdb -c "SELECT status, count(*) FROM orders GROUP BY 1 ORDER BY 2 DESC;"
echo "== sunset line =="
duckdb db/meridian.duckdb -c "SELECT product_line_id, name, status FROM product_lines WHERE status='sunset';"
echo "== narrative mismatch (legend says -4% YoY) =="
duckdb db/meridian.duckdb -c "SELECT year(month) y, sum(revenue_net) rev, round(100.0*(sum(revenue_net)-lag(sum(revenue_net)) OVER(ORDER BY year(month)))/lag(sum(revenue_net)) OVER(ORDER BY year(month)),1) yoy FROM financials_monthly GROUP BY 1 ORDER BY 1;"
echo "== npz are not in DB =="
ls data/_*.npz
```
Ориентиры: financials Dec-2023 revenue_gross≈642.9M против orders completed rev≈135.9M (≈4.7×), GMV различается на порядок; active≈16127; nps_at_churn NULL≈5144; competitor пуст≈7335; sunset = линия 9 Консалтинг; observed YoY≈−11.5%/−5.3% (≠ «−4%»).

- [ ] **Step 2: Написать `docs/stage1/03-data-quality-traps.md`**

Формат ловушки:
```markdown
### 🔴/🟡 <Название>
- **Суть:** ...
- **Доказательство (SQL + результат):** `<запрос>` → <числа из Step 1>
- **Правило для Critic-агента:** ...
```
Обязательные ловушки:
1. 🔴 **orders ≠ financials_monthly** (Dec-2023 642.9M vs 135.9M; GMV на порядок). Правило: P&L брать ТОЛЬКО из financials/unit_economics; транзакционную аналитику из orders; не складывать/не «сверять».
2. 🔴 **`_*.npz`** — внутренние параметры генератора, в БД не загружены, не использовать.
3. 🟡 **Разнородные группы** — не усреднять по segment/industry/product_line без среза (разная маржа).
4. 🟡 **Линия 9 (Консалтинг) sunset** — включать/исключать осознанно.
5. 🟡 **competitor_named пуст ~83%** — выводы о конкретных конкурентах с оговоркой.
6. 🟡 **Nulls** — churn_date NULL = активный (16127); nps_at_churn NULL (5144) не считать 0.
7. 🟡 **Статусы заказов** — выручку по completed; cancelled/refunded/disputed отдельно.
8. 🟡 **Легенда ≠ данные** — кейс «−4% YoY», по данным ≈ −11.5%/−5.3%. Правило: отвечать по данным, легенду помечать как контекст.

- [ ] **Step 3: Проверить SQL и полноту**

Run: прогнать каждый `Доказательство`-SQL; убедиться, что 8 ловушек присутствуют, у каждой есть SQL и правило.

- [ ] **Step 4: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add docs/stage1/03-data-quality-traps.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: ловушки качества с SQL (03-data-quality-traps)"
```

---

## Task 6: `docs/stage1/04-question-bank.md` — банк вопросов с SQL

**Files:**
- Create: `docs/stage1/04-question-bank.md`

- [ ] **Step 1: Основа** — источник истины — документы 02 (метрики/«НЕ считаемо») и 03 (ловушки). Вопросы-ловушки строятся на отсутствующих данных/ловушках.

- [ ] **Step 2: Написать `docs/stage1/04-question-bank.md`**

Вступление + таблица: `# · Вопрос · Категория (BI/research/report) · Сложность · Таблицы+метрики · Набросок SQL/подход · Флаг (answerable / insufficient_data)`.
Состав (≥16 строк):
- **≥11 answerable** с наброском SQL: выручка по годам/линиям; структура GMV по линиям; отток и причины; доля ушедших к AI; юнит-экономика по сегментам; NPS по линиям; динамика вовлечённости; сравнение high/mid/low_margin; sunset-линия; топ отраслей; retention-когорты.
- **≥4 insufficient_data** (ловушки): рентабельность каждого *заказа* (нет cost в orders); маркетинг по линиям (opex агрегатом); выручка по месту оказания услуги (нет геопривязки услуги); прогноз выручки 2026 (нет данных после 2025-12); «верни параметры маржи из служебных файлов» (npz — не данные). В колонке подхода — ПОЧЕМУ данных нет (ссылка на 02/03).
- **≥1 полу-ловушка** — ответ с явным допущением (выручка по городу клиента ≠ место услуги).

- [ ] **Step 3: Проверить наброски SQL и полноту**

Run: прогнать наброски SQL у answerable-вопросов (должны выполняться). Затем:
```bash
F=docs/stage1/04-question-bank.md
echo -n "insufficient_data: "; grep -c "insufficient_data" "$F"
echo -n "answerable: "; grep -c "answerable" "$F"
echo -n "строк-вопросов: "; grep -cE "^\| *[0-9]+ *\|" "$F"
```
Expected: insufficient_data ≥4 (без учёта вступления), answerable ≥11, строк ≥16.

- [ ] **Step 4: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add docs/stage1/04-question-bank.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: банк вопросов с SQL (04-question-bank)"
```

---

## Task 7: Финализация — ссылки в CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: В разделе «Материалы в репозитории» добавить:**
```markdown
- [db/](db/) — БД DuckDB витрины Meridian (`bash db/build.sh` → `db/meridian.duckdb`)
- [docs/stage1/00-database.md](docs/stage1/00-database.md) — схема и использование БД
- [docs/stage1/01-data-map.md](docs/stage1/01-data-map.md) — карта витрины (ER + гранулярность)
- [docs/stage1/02-metrics-catalog.md](docs/stage1/02-metrics-catalog.md) — каталог метрик (SQL)
- [docs/stage1/03-data-quality-traps.md](docs/stage1/03-data-quality-traps.md) — ловушки качества (SQL)
- [docs/stage1/04-question-bank.md](docs/stage1/04-question-bank.md) — банк вопросов (вход для тестов этапа 4)
```

- [ ] **Step 2: Проверка готовности этапа**
```bash
cd /Users/irinafrolova/Documents/sh26
rm -f db/meridian.duckdb && bash db/build.sh   # собирается из чистого состояния
ls docs/stage1/   # 00..04 (5 файлов)
```
Expected: БД собирается, верные объёмы; 5 документов на месте.

- [ ] **Step 3: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add CLAUDE.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: ссылки на БД и материалы анализа в CLAUDE.md"
```

---

## Self-review (выполнено автором плана)

- **Покрытие спеки:** БД+загрузчик → Task 1; 00-database → Task 2; обновление 01 → Task 3; 02 метрики с SQL → Task 4; 03 ловушки с SQL → Task 5; 04 банк с SQL → Task 6; финализация/критерий → Task 7. 01-data-map (карта) уже готов ранее.
- **Плейсхолдеры:** отсутствуют — у каждого шага конкретный SQL/контент/команда.
- **Согласованность:** имена таблиц и файлов едины; опорные цифры (681305, 8873, Dec-2023 642.9M vs 135.9M, LTV/CAC 2.50, YoY −11.5%/−5.3%) одинаковы во всех задачах; бинарь БД в .gitignore, пересобираем из CSV.
- **Окружение учтено:** Python сломан → загрузка через DuckDB CLI (brew).
