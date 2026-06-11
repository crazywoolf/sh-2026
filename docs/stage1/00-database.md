# База данных Meridian (DuckDB)

Запрашиваемая БД-витрина Meridian — единый источник данных для агентов пайплайна (в первую очередь **Extractor**, который генерирует SQL по вопросам) и для разведочного анализа (**EDA**). Все 8 таблиц витрины собраны в один файл `db/meridian.duckdb`, к которому можно обращаться через CLI `duckdb` без поднятия сервера.

## Установка DuckDB

Нужен CLI `duckdb` (проект собран и проверен на v1.5.3).

**Способ 1 — Homebrew:**

```bash
brew install duckdb
```

**Способ 2 — официальный бинарь (если `brew` падает на свежих macOS с `MacOSVersionError`):**

Скачать `duckdb_cli-osx-universal.zip` из релизов <https://github.com/duckdb/duckdb/releases>, распаковать и положить бинарь в каталог на `PATH` (в этом проекте использован именно этот способ — бинарь лежит в `.tools/`, см. `.gitignore`):

```bash
curl -L -o duckdb.zip https://github.com/duckdb/duckdb/releases/latest/download/duckdb_cli-osx-universal.zip
unzip duckdb.zip            # внутри — исполняемый файл duckdb
mkdir -p .tools && mv duckdb .tools/
export PATH="$PWD/.tools:$PATH"   # добавить в ~/.zshrc для постоянства
```

Проверка установки (любой способ):

```bash
duckdb --version
```

## Сборка БД

```bash
bash db/build.sh
```

Скрипт прогоняет `db/load.sql` и создаёт `db/meridian.duckdb` из 8 CSV-файлов, после чего печатает количество строк по каждой таблице. Сборка **идемпотентна** — повторный запуск пересоздаёт таблицы заново.

Сам файл БД **в git не коммитится** (он указан в `.gitignore`) — его всегда можно пересобрать из CSV командой выше.

## Как запрашивать

Разовый запрос из shell:

```bash
duckdb db/meridian.duckdb -c "SELECT count(*) FROM orders;"
```

Интерактивная сессия (выход — `.quit`):

```bash
duckdb db/meridian.duckdb
```

## Таблицы витрины

8 таблиц. Полное описание всех колонок — в [../data-dictionary.md](../data-dictionary.md).

| Таблица | Объём строк | Ключевые типы (id / даты) |
| --- | --- | --- |
| `customers` | 25 000 | `customer_id` integer (PK); `signup_date`, `churn_date` date |
| `product_lines` | 9 | `product_line_id` integer (PK); `launch_date` date |
| `orders` | 681 305 | `order_id` bigint (PK); `customer_id`, `product_line_id` integer (FK); `order_date` date |
| `nps_responses` | 56 164 | `response_id` bigint (PK); `customer_id`, `product_line_id` integer (FK); `response_date` date |
| `customer_activity_monthly` | 608 920 | `customer_id` integer (FK); `month` date |
| `churn_reasons` | 8 873 | `customer_id` integer (FK); `churn_date` date |
| `unit_economics_monthly` | 918 | `product_line_id` integer (FK); `month` date |
| `financials_monthly` | 36 | `month` date (без внешних ключей — агрегат по всей платформе) |

Диапазоны дат: сделки `orders.order_date` — `2023-01-01 … 2025-12-28`; помесячные таблицы (`*_monthly`) — `2023-01 … 2025-12` (36 месяцев).

## Примеры запросов

Все примеры ниже реально прогнаны на `db/meridian.duckdb` и возвращают результат без ошибок.

**Выручка по продуктовым линиям** (только завершённые сделки, `orders` ⨝ `product_lines`):

```sql
SELECT pl.name, ROUND(SUM(o.revenue), 0) AS revenue
FROM orders o
JOIN product_lines pl ON o.product_line_id = pl.product_line_id
WHERE o.status = 'completed'
GROUP BY pl.name
ORDER BY revenue DESC;
```

Возвращает: 9 строк, выручку по каждой линии; лидер — «Разработка и IT» (~1,17 млрд).

**Топ-5 причин оттока** (`churn_reasons` по `primary_reason`):

```sql
SELECT primary_reason, COUNT(*) AS customers
FROM churn_reasons
GROUP BY primary_reason
ORDER BY customers DESC
LIMIT 5;
```

Возвращает: 5 причин; топ — `price` (2185), `no_need` (1679), `quality` (1531).

**NPS по продуктовым линиям** (доля промоутеров минус доля критиков, `nps_responses` ⨝ `product_lines`):

```sql
SELECT pl.name,
       ROUND(100.0 * (SUM(CASE WHEN n.score >= 9 THEN 1 ELSE 0 END)
                    - SUM(CASE WHEN n.score <= 6 THEN 1 ELSE 0 END)) / COUNT(*), 1) AS nps,
       COUNT(*) AS responses
FROM nps_responses n
JOIN product_lines pl ON n.product_line_id = pl.product_line_id
GROUP BY pl.name
ORDER BY nps DESC;
```

Возвращает: NPS по 9 линиям; самые слабые — «Консалтинг» и «Юридические услуги» (~14,5).

**Распределение статусов активности за последний месяц** (`customer_activity_monthly`):

```sql
SELECT status, COUNT(*) AS rows
FROM customer_activity_monthly
WHERE month = (SELECT MAX(month) FROM customer_activity_monthly)
GROUP BY status
ORDER BY rows DESC;
```

Возвращает: 4 статуса за декабрь 2025 — `active` (10 901), `churning` (3257), `dormant` (1992), `churned` (2).

**Помесячные финансы платформы** (последние 6 месяцев, `financials_monthly`):

```sql
SELECT month,
       ROUND(gmv, 0)         AS gmv,
       ROUND(revenue_net, 0) AS revenue_net,
       ROUND(ebitda, 0)      AS ebitda
FROM financials_monthly
ORDER BY month DESC
LIMIT 6;
```

Возвращает: 6 строк; EBITDA на конец 2025 отрицательная (например, декабрь 2025: GMV ~14,4 млрд, revenue_net ~561 млн, EBITDA ~−126 млн).
