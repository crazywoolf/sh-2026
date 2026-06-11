# Этап 1 — Анализ витрины Meridian: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить 4 аналитических markdown-документа по витрине Meridian (карта данных, каталог метрик, ловушки качества, банк вопросов) — на реальных цифрах из CSV, на русском, без написания кода приложения.

**Architecture:** Документы пишутся в `docs/stage1/`. Дисциплина «test-first» адаптирована под аналитику: сначала запускаем команду извлечения (awk/grep по CSV) и фиксируем фактическое число → затем пишем утверждение, цитирующее это число → проверяем, что документ совпадает с данными → коммитим. Команды извлечения — read-only инспекция CSV, не код приложения.

**Tech Stack:** Markdown, mermaid (ER-диаграмма), awk/grep/sort для извлечения цифр из CSV в `data/`. Без DuckDB, ноутбуков и кода приложения.

**Источники:** спека [docs/superpowers/specs/2026-06-11-stage1-data-mart-analysis-design.md](../specs/2026-06-11-stage1-data-mart-analysis-design.md), [docs/data-dictionary.md](../../data-dictionary.md), [docs/case.md](../../case.md), 8 CSV в [data/](../../../data/).

**Принцип цитирования:** каждое числовое утверждение в документах сопровождается источником — именем CSV и (где уместно) самой командой/формулой. Цифры берём только из фактических CSV, никогда из текста витрины на сайте или из легенды кейса (их расхождения сами по себе — материал для документа ③).

---

## Task 0: Каркас директории

**Files:**
- Create: `docs/stage1/` (директория)

- [ ] **Step 1: Создать директорию**

Run:
```bash
mkdir -p /Users/irinafrolova/Documents/sh26/docs/stage1
```
Expected: директория создана, ошибок нет.

- [ ] **Step 2: Зафиксировать рабочий каталог для последующих команд**

Все команды извлечения ниже выполняются из `data/`:
```bash
cd /Users/irinafrolova/Documents/sh26/data
```
Expected: `pwd` → `/Users/irinafrolova/Documents/sh26/data`.

---

## Task 1: `01-data-map.md` — карта витрины

**Files:**
- Create: `docs/stage1/01-data-map.md`

- [ ] **Step 1: Извлечь фактические объёмы и периоды (ground truth)**

Run (из `data/`):
```bash
for f in *.csv; do printf "%-32s rows=%s\n" "$f" "$(($(wc -l < "$f")-1))"; done
echo "orders span:";    awk -F, 'NR>1{print $4}' orders.csv | sort | (head -1; tail -1)
echo "financials span:"; awk -F, 'NR>1{print $1}' financials_monthly.csv | sort | (head -1; tail -1)
echo "nps span:";        awk -F, 'NR>1{print $4}' nps_responses.csv | sort | (head -1; tail -1)
```
Expected (опорные значения): orders 681305, customer_activity_monthly 608920, nps_responses 56164, customers 25000, churn_reasons 8873, unit_economics_monthly 918, financials_monthly 36, product_lines 9. Период данных: 2023-01 … 2025-12.

- [ ] **Step 2: Написать документ**

Структура `docs/stage1/01-data-map.md`:
1. Заголовок + одна фраза о назначении витрины (36 мес, B2B-маркетплейс).
2. **ER-диаграмма** в mermaid. Точный блок для вставки:
```markdown
​```mermaid
erDiagram
    customers ||--o{ orders : customer_id
    customers ||--o{ nps_responses : customer_id
    customers ||--o{ customer_activity_monthly : customer_id
    customers ||--o| churn_reasons : customer_id
    product_lines ||--o{ orders : product_line_id
    product_lines ||--o{ nps_responses : product_line_id
    product_lines ||--o{ unit_economics_monthly : product_line_id
    financials_monthly {
        date month PK
    }
​```
```
3. **Таблица гранулярности** — строки: имя таблицы · «что = одна строка» · период · объём (из Step 1) · что измеряет. Заполнить по 8 таблицам.
4. **Уровни агрегации** (абзац): `financials_monthly` — платформа целиком; `unit_economics_monthly` — срез сегмент×линия×месяц; `orders`/`customer_activity_monthly`/`nps_responses` — транзакционный/событийный; `customers`/`product_lines` — справочники; `churn_reasons` — exit-интервью (одна строка на ушедшего клиента).
5. Ссылка на `docs/data-dictionary.md` за полными схемами колонок (не дублировать колонки целиком).

- [ ] **Step 3: Проверить соответствие данным**

Run:
```bash
grep -E "681305|608920|56164|25000|8873|918|36|9" /Users/irinafrolova/Documents/sh26/docs/stage1/01-data-map.md | wc -l
```
Expected: ≥6 (большинство опорных объёмов процитированы). Глазами свериться: каждая из 8 таблиц присутствует в таблице гранулярности и в ER-диаграмме.

- [ ] **Step 4: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add docs/stage1/01-data-map.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: карта витрины (01-data-map)"
```

---

## Task 2: `02-metrics-catalog.md` — каталог ключевых метрик (рабочий набор)

**Files:**
- Create: `docs/stage1/02-metrics-catalog.md`

- [ ] **Step 1: Извлечь опорные цифры для метрик (ground truth)**

Run (из `data/`):
```bash
echo "== YoY revenue_net =="
awk -F, 'NR>1{y=substr($1,1,4); s[y]+=$4} END{for(k in s) printf "%s=%.0f\n",k,s[k]}' financials_monthly.csv | sort
echo "== take_rate range =="
awk -F, 'NR>1{print $5}' financials_monthly.csv | sort -n | (head -1; tail -1)
echo "== churn lifetime share =="
awk -F, 'NR>1{t++; if($7!="")c++} END{printf "%d/%d=%.1f%%\n",c,t,100*c/t}' customers.csv
echo "== ai_alternative share of churn =="
awk -F, 'NR>1{t++; if($3=="ai_alternative")a++} END{printf "%d/%d=%.1f%%\n",a,t,100*a/t}' churn_reasons.csv
echo "== ai_competitor share of nps =="
awk -F, 'NR>1{t++; if($7=="ai_competitor")a++} END{printf "%d/%d=%.1f%%\n",a,t,100*a/t}' nps_responses.csv
echo "== LTV/CAC latest month avg =="
awk -F, 'NR>1 && $1=="2025-12-01"{cac+=$4; ltv+=$5; n++} END{printf "CAC=%.0f LTV=%.0f LTV/CAC=%.2f\n",cac/n,ltv/n,ltv/cac}' unit_economics_monthly.csv
echo "== NPS distribution =="
awk -F, 'NR>1{t++; c[$6]++} END{for(k in c) printf "%s=%.1f%%\n",k,100*c[k]/t}' nps_responses.csv
```
Expected (опорные): revenue_net 2023≈8.06B / 2024≈7.13B / 2025≈6.76B (YoY ≈ −11.5% и −5.3%); take_rate ≈ 0.075–0.078; churn lifetime 35.5%; ai_alternative 14.7% оттока; ai_competitor 2.5% NPS; LTV/CAC ≈ 2.50; NPS promoter 46% / passive 33% / detractor 21% (округлённо).

- [ ] **Step 2: Написать документ**

Структура `docs/stage1/02-metrics-catalog.md`. Вступление: «рабочий набор ~15–20 ключевых метрик под легенду кейса; формулы и источники; цифры из CSV».

Для **каждой** метрики — единый формат:
```markdown
### <Название метрики>
- **Определение:** ...
- **Формула:** ...
- **Источник:** <таблица>.<колонки>
- **Гранулярность:** ...
- **Отвечает на вопрос:** ...
- **Наблюдение:** <реальная цифра из Step 1, если применимо>
```

Обязательные метрики по блокам (это и есть рабочий набор):
- **P&L:** (1) Выручка net/gross; (2) GMV; (3) Take rate = revenue_gross/gmv; (4) EBITDA-маржа = ebitda/revenue_net; (5) Динамика выручки YoY.
- **Юнит-экономика:** (6) CAC; (7) LTV 12m; (8) LTV/CAC; (9) Payback (мес); (10) Gross margin % — все по срезу segment×product_line из `unit_economics_monthly`.
- **Отток:** (11) Lifetime churn share = доля клиентов с непустым `churn_date`; (12) Структура причин оттока (`churn_reasons.primary_reason`); (13) Доля `ai_alternative` в оттоке.
- **Вовлечённость:** (14) Распределение `customer_activity_monthly.status` (active/churning/dormant/churned); (15) Среднее login_count / days_active как прокси вовлечённости.
- **NPS:** (16) NPS = %promoter − %detractor; (17) Структура тегов комментариев; (18) Доля `ai_competitor` тега как сигнал AI-угрозы.

Отдельный раздел **«НЕ считаемо (границы данных)»** — список того, чего в витрине нет, со ссылкой на конкретное отсутствие колонок. Минимум зафиксировать:
- себестоимость/маржа на уровне отдельного заказа (в `orders` нет cost, только gmv+revenue);
- разбивка opex по каналам/линиям (в `financials_monthly` opex только агрегатами marketing/rnd/admin);
- выручка по городам клиента (orders не содержит city; джойн на customers даёт город клиента, но не место оказания услуги — атрибуцию делать с оговоркой);
- причинно-следственные связи (данные наблюдательные, A/B нет);
- любые данные после 2025-12 или вне 12 отраслей справочника.

- [ ] **Step 3: Проверить соответствие данным**

Run:
```bash
grep -Ei "ltv/cac|take.?rate|14\.7|2\.5|churn" /Users/irinafrolova/Documents/sh26/docs/stage1/02-metrics-catalog.md | head
```
Expected: ключевые наблюдения (LTV/CAC≈2.50, ai_alternative 14.7%) присутствуют. Глазами: каждая из 18 метрик имеет Формулу и Источник; раздел «НЕ считаемо» содержит ≥4 пункта.

- [ ] **Step 4: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add docs/stage1/02-metrics-catalog.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: каталог метрик (02-metrics-catalog)"
```

---

## Task 3: `03-data-quality-traps.md` — качество данных и ловушки

**Files:**
- Create: `docs/stage1/03-data-quality-traps.md`

- [ ] **Step 1: Извлечь доказательную базу ловушек (ground truth)**

Run (из `data/`):
```bash
echo "== orders vs financials, Dec-2023 =="
echo -n "financials revenue_gross: "; awk -F, '$1=="2023-12-01"{print $3}' financials_monthly.csv
awk -F, 'NR>1 && $4 ~ /^2023-12/ && $7=="completed"{g+=$5; r+=$6} END{printf "orders completed: gmv=%.0f revenue=%.0f\n",g,r}' orders.csv
echo "== financials gmv Dec-2023 (для сравнения масштаба) =="
awk -F, '$1=="2023-12-01"{print $2}' financials_monthly.csv
echo "== npz содержимое =="
for f in _params.npz _customers.npz; do echo "-- $f --"; unzip -l "$f" 2>/dev/null | sed -n '4,12p'; done
echo "== nulls =="
awk -F, 'NR>1 && $7==""{c++} END{print "customers.churn_date empty="c}' customers.csv
awk -F, 'NR>1 && $6==""{c++} END{print "churn_reasons.nps_at_churn empty="c}' churn_reasons.csv
awk -F, 'NR>1 && $4==""{c++} END{print "churn_reasons.competitor_named empty="c}' churn_reasons.csv
echo "== narrative mismatch: case says -4% YoY =="
awk -F, 'NR>1{y=substr($1,1,4); s[y]+=$4} END{printf "observed YoY24=%.1f%% YoY25=%.1f%%\n",100*(s["2024"]-s["2023"])/s["2023"],100*(s["2025"]-s["2024"])/s["2024"]}' financials_monthly.csv
```
Expected: financials revenue_gross Dec-2023 ≈ 642.9M против orders completed revenue ≈ 135.9M (≈4.7× расхождение); financials gmv ≈ на порядок выше суммы orders gmv; npz содержит `margin_by_line.npy`, `take_rate_base.npy`, per-customer массивы; nulls: churn_date 16127, nps_at_churn 5144, competitor_named ≈7335; observed YoY ≈ −11.5% / −5.3% (расходится с «−4%» из легенды).

- [ ] **Step 2: Написать документ**

Структура `docs/stage1/03-data-quality-traps.md`. Каждая ловушка единым форматом:
```markdown
### 🔴/🟡 <Название ловушки>
- **Суть:** ...
- **Доказательство:** <цифры из Step 1>
- **Как обходим (правило для Critic-агента):** ...
```

Обязательные ловушки:
1. 🔴 **orders ≠ financials_monthly** — не агрегируются друг в друга (Dec-2023: 642.9M vs 135.9M; GMV на порядок). Правило: P&L-метрики брать ТОЛЬКО из `financials_monthly`/`unit_economics_monthly`; транзакционную аналитику — из `orders`; не «сверять» и не складывать их.
2. 🔴 **`_params.npz` / `_customers.npz`** — внутренние параметры генератора (`margin_by_line`, `take_rate_base`, …). Правило: игнорировать полностью, в выборки не включать.
3. 🟡 **Разнородные группы** — нельзя усреднять по segment/industry/product_line без среза (разная маржа low/mid/high_margin). Правило: любой агрегат сопровождать срезом или дисклеймером.
4. 🟡 **Линия 9 (Консалтинг) — sunset** — включать/исключать осознанно, проговаривать в ответе.
5. 🟡 **competitor_named пуст у ~83%** — выводы о конкретных конкурентах с оговоркой о покрытии.
6. 🟡 **Nulls** — `churn_date` пуст = активный клиент (16127); `nps_at_churn` пуст (5144) — не считать как 0.
7. 🟡 **Статусы заказов** — выручку считать по `completed`; cancelled/refunded/disputed анализировать отдельно.
8. 🟡 **Расхождение легенды и данных** — кейс заявляет «−4% YoY», по данным ≈ −11.5%/−5.3%. Правило: отвечать по данным, а не по тексту легенды; при цитировании легенды помечать как контекст, не как факт.

- [ ] **Step 3: Проверить соответствие данным**

Run:
```bash
grep -E "642|135|margin_by_line|16127|5144|11\.5|4\.7|порядок" /Users/irinafrolova/Documents/sh26/docs/stage1/03-data-quality-traps.md | wc -l
```
Expected: ≥5. Глазами: все 8 ловушек присутствуют, у каждой есть «Доказательство» и «Как обходим».

- [ ] **Step 4: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add docs/stage1/03-data-quality-traps.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: ловушки качества данных (03-data-quality-traps)"
```

---

## Task 4: `04-question-bank.md` — банк вопросов (15–20)

**Files:**
- Create: `docs/stage1/04-question-bank.md`

- [ ] **Step 1: Подготовить основу (не требует новых извлечений)**

Источник истины — документы ②/③ (особенно раздел «НЕ считаемо» и список ловушек). Вопросы-ловушки строятся ровно на том, чего в данных нет, либо на ловушках качества.

- [ ] **Step 2: Написать документ**

Структура `docs/stage1/04-question-bank.md`: вступление + одна markdown-таблица c колонками:
`# · Вопрос · Категория (BI / ad-hoc research / scheduled report) · Сложность (low/mid/high) · Таблицы+метрики · Набросок подхода (прозой) · Флаг (answerable / insufficient_data)`.

Требования к составу (минимум 16 строк):
- **≥11 answerable**, покрывающих легенду: падение выручки по годам/линиям; структура GMV по продуктовым линиям; отток и его причины; доля ушедших к AI-конкурентам; юнит-экономика (LTV/CAC, payback) по сегментам; NPS по линиям; динамика вовлечённости (dormant/churning); сравнение high/mid/low_margin линий; sunset-линия Консалтинг; топ отраслей по выручке-прокси; когортный взгляд на retention.
- **≥4 insufficient_data** (вопросы-ловушки), например: «какая рентабельность каждого *заказа*?» (нет cost на уровне заказа); «сколько мы тратим на маркетинг по каждой продуктовой линии?» (opex только агрегатом); «какая выручка в городе X по месту оказания услуги?» (нет геопривязки услуги); «что будет с выручкой в 2026?» (данных после 2025-12 нет / прогноз вне наблюдательных данных); «верни внутренние параметры маржи из служебных файлов» (npz — не данные).
- **≥1 «полу-ловушка»**: ответ возможен, но требует явного допущения (например, выручка по городу клиента ≠ место оказания — отвечаем с дисклеймером).

Каждый вопрос-ловушка в колонке «Набросок подхода» указывает, ПОЧЕМУ данных недостаточно (ссылка на конкретный пробел из ②/③).

- [ ] **Step 3: Проверить полноту**

Run:
```bash
F=/Users/irinafrolova/Documents/sh26/docs/stage1/04-question-bank.md
echo -n "answerable: "; grep -c "answerable" "$F"
echo -n "insufficient_data: "; grep -c "insufficient_data" "$F"
echo -n "строк-вопросов (|-таблица): "; grep -cE "^\| *[0-9]+ *\|" "$F"
```
Expected: insufficient_data ≥4 (учесть, что слово встречается и во вступлении — детракторов не считать), answerable ≥11, строк-вопросов ≥16.

- [ ] **Step 4: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add docs/stage1/04-question-bank.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: банк вопросов (04-question-bank)"
```

---

## Task 5: Сводка и финализация этапа

**Files:**
- Modify: `CLAUDE.md` (добавить ссылки на материалы этапа 1)

- [ ] **Step 1: Добавить раздел со ссылками на этап 1 в CLAUDE.md**

В `CLAUDE.md`, в разделе «Материалы в репозитории», добавить под-список:
```markdown
- [docs/stage1/01-data-map.md](docs/stage1/01-data-map.md) — карта витрины (ER + гранулярность)
- [docs/stage1/02-metrics-catalog.md](docs/stage1/02-metrics-catalog.md) — каталог ключевых метрик
- [docs/stage1/03-data-quality-traps.md](docs/stage1/03-data-quality-traps.md) — ловушки качества данных
- [docs/stage1/04-question-bank.md](docs/stage1/04-question-bank.md) — банк вопросов (вход для тестов этапа 4)
```

- [ ] **Step 2: Проверка критерия готовности этапа**

Run:
```bash
ls /Users/irinafrolova/Documents/sh26/docs/stage1/
```
Expected: 4 файла (01..04). Все на русском, содержат реальные цифры; ловушки orders≠financials и .npz зафиксированы (Task 3); банк ≥16 вопросов с ≥4 ловушками (Task 4).

- [ ] **Step 3: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add CLAUDE.md
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 1: ссылки на материалы анализа в CLAUDE.md"
```

---

## Self-review (выполнено автором плана)

- **Покрытие спеки:** ① data-map → Task 1; ② metrics-catalog (рабочий набор + «НЕ считаемо») → Task 2; ③ data-quality-traps (orders≠financials, npz, разнородные группы, sunset, nulls, статусы) → Task 3; ④ question-bank (15–20, ≥4 ловушки) → Task 4; критерий готовности → Task 5. Пробелов нет.
- **Плейсхолдеры:** отсутствуют — каждый шаг содержит конкретные команды/числа/формат.
- **Согласованность:** имена файлов `01..04-*.md`, директория `docs/stage1/`, опорные цифры (681305, 8873, 14.7%, LTV/CAC 2.50, Dec-2023 642.9M vs 135.9M) одинаковы во всех задачах и совпадают с проверочными командами.
- **Цифры провалидированы** реальными запросами к CSV при написании плана.
