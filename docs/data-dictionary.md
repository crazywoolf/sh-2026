# Витрина данных Meridian — справочник

Источник: https://dashboard.aisouthhack.ru/data + реальные заголовки и значения из CSV в [../data/](../data/).

**Охват:** 36 месяцев (январь 2023 — декабрь 2025). ~25 000 клиентов, ~681 тыс. заказов, ~56 тыс. NPS-ответов, ~609 тыс. строк активности. 8 таблиц + 2 вспомогательных `.npz` (служебные параметры генерации — `_params.npz`, `_customers.npz`; в анализе не нужны).

> ⚠️ Цифры из витрины на сайте («200 000 orders, 80 000 NPS, 900 000 activity») — приблизительные/устаревшие. Ниже — **фактические row counts из выданных CSV.**

---

## 1. financials_monthly.csv — 36 строк
Помесячный P&L всей платформы.

| Колонка | Тип | Описание |
|---|---|---|
| month | date | Месяц (первое число) |
| gmv | float | Оборот платформы |
| revenue_gross | float | Валовая выручка |
| revenue_net | float | Чистая выручка |
| take_rate | float | Доля платформы (≈0.075–0.078) |
| cogs | float | Себестоимость |
| opex_marketing | float | OPEX: маркетинг |
| opex_rnd | float | OPEX: R&D |
| opex_admin | float | OPEX: административные |
| ebitda | float | EBITDA |
| capex | float | Капзатраты |
| headcount | int | Численность сотрудников |

## 2. unit_economics_monthly.csv — 918 строк
Юнит-экономика по сегменту × продуктовой линии × месяцу.

| Колонка | Тип | Описание |
|---|---|---|
| month | date | Месяц |
| segment | enum | SMB / Mid / Large |
| product_line_id | FK→product_lines | Продуктовая линия |
| cac | int | Стоимость привлечения |
| ltv_12m | int | LTV за 12 месяцев |
| payback_months | float | Срок окупаемости, мес |
| gross_margin_pct | float | Валовая маржа, доля |
| take_rate_effective | float | Эффективный take rate |
| new_customers | int | Новые клиенты |

## 3. customers.csv — 25 000 строк
Справочник клиентов. **PK: customer_id.**

| Колонка | Тип | Значения / описание |
|---|---|---|
| customer_id | PK int | |
| segment | enum | SMB (15 659), Mid (7 369), Large (1 972) |
| industry | enum | 12 отраслей: Розница, Медицина, Профуслуги, Строительство, Финуслуги, Производство, HoReCa, Образование, Недвижимость, Логистика, ИТ и софт, Медиа (~2000 каждая) |
| city | str | Город |
| employee_count_band | enum | `<50`, `200-500`, … |
| signup_date | date | Дата регистрации |
| churn_date | date/null | Дата оттока (пусто = активен) |
| contract_type | enum | annual (10 624), monthly (10 037), pay_as_you_go (4 339) |
| acquisition_channel | enum | organic (7 534), paid (8 222), referral (5 004), direct (4 240) |

## 4. orders.csv — 681 305 строк
Транзакции. **PK: order_id.** Диапазон дат: 2023-01-01 … 2025-12-28.

| Колонка | Тип | Значения / описание |
|---|---|---|
| order_id | PK int | |
| customer_id | FK→customers | |
| product_line_id | FK→product_lines | |
| order_date | date | |
| gmv | int | Сумма заказа (оборот) |
| revenue | float | Выручка платформы с заказа |
| status | enum | completed (629 348), cancelled (30 179), refunded (14 936), disputed (6 842) |
| provider_type | enum | marketplace_provider (447 865), direct_contract (126 141), api_integration (107 299) |

## 5. product_lines.csv — 9 строк
Справочник продуктовых линий. **PK: product_line_id.**

| id | name | category | launch_date | status |
|---|---|---|---|---|
| 1 | Маркетинг и реклама | mid_margin | 2019-03-01 | active |
| 2 | Юридические услуги | high_margin | 2019-03-01 | active |
| 3 | Разработка и IT | high_margin | 2019-06-01 | active |
| 4 | Бухгалтерия и финучёт | mid_margin | 2020-01-01 | active |
| 5 | Рекрутинг | mid_margin | 2020-09-01 | active |
| 6 | Логистика и склад | low_margin | 2021-02-01 | active |
| 7 | Аутсорс операций | low_margin | 2021-08-01 | active |
| 8 | Дизайн и креатив | mid_margin | 2020-05-01 | active |
| 9 | Консалтинг | high_margin | 2019-09-01 | **sunset** |

## 6. nps_responses.csv — 56 164 строк
NPS-опросы. **PK: response_id.**

| Колонка | Тип | Значения / описание |
|---|---|---|
| response_id | PK int | |
| customer_id | FK→customers | |
| product_line_id | FK→product_lines | |
| response_date | date | |
| score | int | 0–10 |
| category | enum | promoter (25 830), passive (18 440), detractor (11 894) |
| comment_tag | enum | nps_growth (29 649), price (8 983), quality (8 641), support (5 894), churn_intent (1 610), **ai_competitor (1 387)** |

## 7. customer_activity_monthly.csv — 608 920 строк
Помесячные снимки активности клиента.

| Колонка | Тип | Значения / описание |
|---|---|---|
| customer_id | FK→customers | |
| month | date | |
| orders_count | int | Заказов за месяц |
| gmv_total | float | Оборот за месяц |
| days_active | int | Активных дней |
| login_count | int | Входов |
| status | enum | active (468 429), churning (79 020), dormant (61 145), churned (326) |

## 8. churn_reasons.csv — 8 873 строк
Данные exit-интервью.

| Колонка | Тип | Значения / описание |
|---|---|---|
| customer_id | FK→customers | |
| churn_date | date | |
| primary_reason | enum | price (2 185), no_need (1 679), quality (1 531), consolidation (1 374), **ai_alternative (1 301)**, other (803) |
| competitor_named | str/null | Назван конкурент: MarketAI, AILegal Pro, DevForge.ai, FinBot Pro, HireSense AI, «Конкурент-маркетплейс», «Ушли inhouse» (у ~7 335 — пусто) |
| interview_completed | bool | Интервью завершено |
| nps_at_churn | int/null | NPS на момент оттока |

---

## Связи (FK)

```
customers (customer_id) ──┬─< orders
                          ├─< nps_responses
                          ├─< customer_activity_monthly
                          └─< churn_reasons

product_lines (product_line_id) ──┬─< orders
                                  ├─< nps_responses
                                  └─< unit_economics_monthly
```
`financials_monthly` — агрегат уровня платформы (без FK).

## Ловушки для анализа (data quality / boundary discipline)
- **Сезонность/устаревшие цифры витрины** — считать всегда по фактическим CSV, не по тексту с сайта.
- **Разнородные группы:** не усреднять по segment/industry/product_line без явного среза — маржинальность линий разная (low/mid/high_margin).
- **status заказов:** считать выручку обычно по `completed`; cancelled/refunded/disputed — отдельно.
- **Линия 9 (Консалтинг) — sunset:** включать/исключать осознанно.
- **churn_date пустой = активный** клиент; `churned` в activity всего 326 строк — большинство «уходящих» в статусе `churning`.
- **competitor_named** пуст у ~83% строк оттока — заявления про конкретных конкурентов делать с оговоркой.
- **ai_competitor / ai_alternative** теги — прямой сигнал угрозы от AI-инструментов (тема кейса).
