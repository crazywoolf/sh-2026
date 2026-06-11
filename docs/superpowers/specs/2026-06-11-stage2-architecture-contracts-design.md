# Дизайн: Этап 2 — Архитектура агентов и контракты обмена

**Дата:** 2026-06-11
**Хакатон:** AI South Hub 2026, кейс «Meridian»
**Этап пайплайна:** Stage 2 — Architecture & Contracts (до реализации)

## Контекст и цель

Зафиксировать архитектуру мультиагентной системы и **контракты обмена данными между агентами в письменном виде** — до написания кода (этап 3). Опора: готовая БД DuckDB и материалы этапа 1 (`docs/stage1/`). Поставка этапа — этот дизайн-документ; код агентов — этап 3.

## Ключевые решения (согласовано с пользователем)

1. **Стек:** Node.js / TypeScript (локально работает из коробки; `python3` в окружении сломан). HTTP — Fastify.
2. **LLM:** OpenAI-совместимый клиент (`openai` npm, настраиваемые `base_url`/`model`/`api_key` через env).
3. **Доступ к данным:** гибрид — библиотека проверенных метрик (из `02-metrics-catalog.md`) как основной путь для BI + guarded free-SQL для ad-hoc.
4. **Оркестрация:** линейный пайплайн Extractor→Analyst→Critic→Visualization с loopback Критика (≤2 повтора) + planner-шаг для декомпозиции research-вопросов.

## Поток данных (топология)

```
POST /api/chat {message, session_id?}
  → Planner: mode = bi | research | insufficient (+ декомпозиция для research)
  → по каждому (под)вопросу: Extractor → Analyst → Critic
        Critic: approved → Visualization → результат под-вопроса
        Critic: revise (target=extractor|analyst, ≤2 раза) → назад на доработку
        Critic: reject → insufficient_data
  → (research) синтез под-ответов в единый ответ
  → FinalResponse {response, assumptions, trace, chart, insufficient_data, session_id}
```

- **BI** — один проход. **Research** — planner режет на под-вопросы → пайплайн по каждому → синтез. **Scheduled reports** — те же пресет-вопросы через тот же пайплайн (архитектура готова, реализация позже).
- **Синтез research** выполняет оркестратор отдельным LLM-вызовом тира Analyst: на вход — массив `AnalystOutput` под-вопросов + исходный вопрос, на выход — единый `AnalystOutput` (агрегированный ответ, объединённые допущения/оговорки). Затем он проходит Critic и Visualization как обычный ответ.
- Три режима кейса покрыты одной универсальной архитектурой (требование пайплайна — не затачивать только под чат).

## Агенты: ответственность и тиры LLM

| Агент | Ответственность | Тир |
|---|---|---|
| **Planner** | Классифицирует режим; декомпозирует research-вопрос; ловит явно невозможное → `insufficient` | дешёвый |
| **Extractor** | Выбор метрики из библиотеки ИЛИ генерация guarded SQL → выполнение на DuckDB (read-only) → строки + метаданные + честная оценка достаточности | средний |
| **Analyst** | Из строк → бизнес-вывод на русском: метод, допущения, оговорки, уверенность | средний |
| **Critic** | Чек-лист по ловушкам из `03`; вердикт; направление правки | средний/дешёвый |
| **Visualization** | Выбор типа графика под данные или `null` | дешёвый |

## Контракты обмена (TS-типы → `src/contracts/types.ts`)

```ts
// Вход оркестратора
type UserQuery = { message: string; session_id?: string };

// Planner → orchestrator
type PlannerOutput = {
  mode: "bi" | "research" | "insufficient";
  reasoning: string;
  sub_questions: string[];          // 1 для bi, N для research, [] для insufficient
};

// Extractor → Analyst (+ Critic)
type ExtractorOutput = {
  approach: "metric_template" | "free_sql";
  metric_id?: string;               // если из библиотеки
  sql: string;                      // фактически выполненный
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];  // результат, capped (≤1000 строк)
  row_count: number;
  data_sufficient: boolean;         // честная оценка достаточности данных
  notes: string;                    // напр. "join по customer_id, фильтр status=completed"
  assumptions: string[];
};

// Analyst → Critic (+ Visualization)
type AnalystOutput = {
  answer: string;                   // вывод на русском
  key_findings: string[];
  method: string;                   // как посчитано
  assumptions: string[];
  caveats: string[];
  confidence: "high" | "medium" | "low";
};

// Critic → orchestrator
type CriticOutput = {
  verdict: "approved" | "revise" | "reject";
  checks: { name: string; passed: boolean; comment: string }[];
  issues: string[];
  target?: "extractor" | "analyst"; // куда вернуть на правку при revise
  guidance?: string;                // что исправить
};

// Visualization → orchestrator
type VizOutput = {
  chart: null | {
    type: "line" | "bar" | "grouped_bar" | "pie" | "table" | "scatter";
    title: string;
    x: string;
    y: string | string[];
    series?: string;
    data: Record<string, unknown>[];
  };
  rationale: string;
};

// Элемент трассировки (для прозрачности в ответе)
type TraceEntry = {
  agent: "planner" | "extractor" | "analyst" | "critic" | "visualizer";
  sql?: string; rows?: number; verdict?: string; note?: string;
};

// Внешний ответ API (контракт судьи)
type FinalResponse = {
  response: string;                 // analyst.answer или синтез research
  assumptions: string[];
  trace: TraceEntry[];
  chart: VizOutput["chart"];
  insufficient_data: boolean;
  session_id: string;
};
```

### Чек-лист Critic (из `03-data-quality-traps.md`)
- orders и financials НЕ смешаны (P&L только из financials/unit_economics);
- присутствует фильтр `status` там, где считается выручка;
- нет усреднения разнородных групп без среза (segment/industry/product_line);
- все колонки в SQL реально существуют в схеме;
- `data_sufficient` честен (вопрос вне данных → не выдумывать);
- числа в `answer` совпадают со строками `rows` (нет галлюцинаций);
- sunset-линия (Консалтинг) учтена осознанно;
- легенда кейса не выдаётся за факт из данных.

## Внешний API-контракт

- Пути: `POST /api/chat` + алиасы `/api/v1/chat`, `/chat`, `/api/ask`, `/api/query`.
- Вход: `{message}` | `{query}` | `{messages:[{role,content}]}`; опц. `session_id`.
- Выход: `FinalResponse` (выше). Поле ответа — `response`.
- `insufficient_data: true`, когда planner=`insufficient` ИЛИ extractor `data_sufficient=false` ИЛИ critic `reject`.

## Обработка ошибок и guard-rails (никаких 500)

- Каждый слой в try/catch; ошибка агента → деградация к честному ответу/`insufficient_data`, не 500.
- Валидация на границе: пустое тело→400, кривой JSON→400, нет поля вопроса→422, левый путь→404; ошибки JSON-полем `error`/`detail`.
- **SQL guard-rails:** соединение read-only; разрешён только `SELECT`; белый список 8 таблиц; авто-`LIMIT`; таймаут запроса; запрет `_*`-объектов.
- Critic-loopback ≤2 повторов (защита от циклов и таймаутов 5/10 мин).
- Бонусы контракта: `GET /health→200`, `/docs`|`/openapi.json`, CORS, опц. SSE.

## Структура модулей

```
src/
  server.ts            # Fastify: роуты, маппинг ошибок, /health, /docs
  orchestrator.ts      # роутинг режима, loopback, синтез research
  agents/
    planner.ts
    extractor.ts
    analyst.ts
    critic.ts
    visualizer.ts
  llm/client.ts        # OpenAI-совместимая обёртка (env: base_url/model/key)
  db/duck.ts           # read-only выполнение SQL + guard-rails
  metrics/library.ts   # шаблоны метрик из catalog 02
  contracts/types.ts   # все типы выше — главный артефакт этапа 2
  session/store.ts     # in-memory контекст сессии
```

## Зависимости
- Вход: `db/meridian.duckdb`, `docs/stage1/` (метрики 02, ловушки 03, банк 04 — тесты).
- Выход: дизайн-документ (этот файл). На этапе 3 из него рождаются `contracts/types.ts` и модули.

## Вне scope
- Реализация агентов и сервера (этап 3).
- Фронтенд/дашборд (этап 5).
- Деплой в Yandex Cloud (позже; архитектура переносима).

## Критерий готовности этапа 2
- Зафиксированы: топология, ответственность 5 ролей (planner + 4 агента), все JSON-контракты, чек-лист Critic, внешний API-контракт, guard-rails, структура модулей.
- Документ непротиворечив и достаточен, чтобы этап 3 начинался без новых архитектурных решений.
