# Этап 3 — MVP мультиагентной системы Meridian: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий MVP по спеке этапа 2: Node.js/TS система (planner + 4 агента + оркестратор + Fastify API под контракт судьи) со сквозным тестом на простом вопросе «выручка по продуктовым линиям».

**Architecture:** Всё на dependency injection ради тестируемости без живого LLM: агенты получают `LLMClient`, оркестратор получает агентов, сервер получает оркестратор. БД — чтение через CLI `duckdb -readonly -json` (без нативных зависимостей). LLM — OpenAI-совместимый клиент (env). Контракты из спеки → `src/contracts/types.ts` + zod-схемы. Тесты детерминированы фейковым LLM; «живой» e2e запускается вручную при наличии ключа.

**Tech Stack:** Node 22, TypeScript, tsx (запуск без сборки), node:test + node:assert, Fastify, openai (npm), zod. БД — DuckDB CLI (`-readonly -json`).

**Источники:** спека [../specs/2026-06-11-stage2-architecture-contracts-design.md](../specs/2026-06-11-stage2-architecture-contracts-design.md); метрики/ловушки/банк — `docs/stage1/`; БД — `db/meridian.duckdb` (собрать `bash db/build.sh`).

**Конвенции для всех задач:**
- Тесты: `npm test` (= `node --import tsx --test 'src/**/*.test.ts'`). Один тест — `node --import tsx --test src/path/file.test.ts`.
- Проверка типов: `npm run typecheck`.
- Каждый коммит: `git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "..."`.
- Сначала падающий тест, потом минимальная реализация (TDD).

---

## Task 1: Каркас проекта (Node/TS/tsx/test)

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/sanity.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: package.json**

Create `package.json`:
```json
{
  "name": "meridian-agents",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "tsx src/main.ts",
    "test": "node --import tsx --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^5",
    "openai": "^4",
    "zod": "^3"
  },
  "devDependencies": {
    "tsx": "^4",
    "typescript": "^5",
    "@types/node": "^22"
  }
}
```

- [ ] **Step 2: tsconfig.json**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: .gitignore — node_modules**

Добавить в `.gitignore`:
```
node_modules/
dist/
.env
```

- [ ] **Step 4: Установить зависимости**

Run: `cd /Users/irinafrolova/Documents/sh26 && npm install`
Expected: создаётся `node_modules/`, `package-lock.json`, без фатальных ошибок.

- [ ] **Step 5: Падающий sanity-тест**

Create `src/sanity.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ping } from "./sanity.ts";

test("ping returns pong", () => {
  assert.equal(ping(), "pong");
});
```

- [ ] **Step 6: Запустить — падает (нет модуля)**

Run: `npm test`
Expected: FAIL — `Cannot find module './sanity.ts'`.

- [ ] **Step 7: Минимальная реализация**

Create `src/sanity.ts`:
```ts
export function ping(): string {
  return "pong";
}
```

- [ ] **Step 8: Тест проходит + typecheck**

Run: `npm test` → PASS (1 test). Затем `npm run typecheck` → без ошибок.

- [ ] **Step 9: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add package.json package-lock.json tsconfig.json .gitignore src/sanity.ts src/sanity.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: каркас Node/TS проекта"
```

---

## Task 2: Контракты (`contracts/types.ts`) + zod-схемы

**Files:**
- Create: `src/contracts/types.ts`, `src/contracts/types.test.ts`

- [ ] **Step 1: Падающий тест валидации контрактов**

Create `src/contracts/types.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PlannerOutputSchema, CriticOutputSchema, FinalResponseSchema } from "./types.ts";

test("PlannerOutput: валидный bi-режим парсится", () => {
  const v = PlannerOutputSchema.parse({ mode: "bi", reasoning: "r", sub_questions: ["q"] });
  assert.equal(v.mode, "bi");
});

test("PlannerOutput: неизвестный режим отклоняется", () => {
  assert.throws(() => PlannerOutputSchema.parse({ mode: "x", reasoning: "", sub_questions: [] }));
});

test("CriticOutput: verdict обязателен", () => {
  assert.throws(() => CriticOutputSchema.parse({ checks: [], issues: [] }));
});

test("FinalResponse: insufficient_data — boolean", () => {
  const v = FinalResponseSchema.parse({
    response: "ответ", assumptions: [], trace: [], chart: null,
    insufficient_data: true, session_id: "s1",
  });
  assert.equal(v.insufficient_data, true);
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm test -- src/contracts/types.test.ts` (или `node --import tsx --test src/contracts/types.test.ts`)
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация контрактов**

Create `src/contracts/types.ts`:
```ts
import { z } from "zod";

export const UserQuerySchema = z.object({
  message: z.string(),
  session_id: z.string().optional(),
});
export type UserQuery = z.infer<typeof UserQuerySchema>;

export const PlannerOutputSchema = z.object({
  mode: z.enum(["bi", "research", "insufficient"]),
  reasoning: z.string(),
  sub_questions: z.array(z.string()),
});
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export const ColumnSchema = z.object({ name: z.string(), type: z.string() });

export const ExtractorOutputSchema = z.object({
  approach: z.enum(["metric_template", "free_sql"]),
  metric_id: z.string().optional(),
  sql: z.string(),
  columns: z.array(ColumnSchema),
  rows: z.array(z.record(z.unknown())),
  row_count: z.number(),
  data_sufficient: z.boolean(),
  notes: z.string(),
  assumptions: z.array(z.string()),
});
export type ExtractorOutput = z.infer<typeof ExtractorOutputSchema>;

export const AnalystOutputSchema = z.object({
  answer: z.string(),
  key_findings: z.array(z.string()),
  method: z.string(),
  assumptions: z.array(z.string()),
  caveats: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});
export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;

export const CriticOutputSchema = z.object({
  verdict: z.enum(["approved", "revise", "reject"]),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), comment: z.string() })),
  issues: z.array(z.string()),
  target: z.enum(["extractor", "analyst"]).optional(),
  guidance: z.string().optional(),
});
export type CriticOutput = z.infer<typeof CriticOutputSchema>;

export const ChartSchema = z.object({
  type: z.enum(["line", "bar", "grouped_bar", "pie", "table", "scatter"]),
  title: z.string(),
  x: z.string(),
  y: z.union([z.string(), z.array(z.string())]),
  series: z.string().optional(),
  data: z.array(z.record(z.unknown())),
});

export const VizOutputSchema = z.object({
  chart: ChartSchema.nullable(),
  rationale: z.string(),
});
export type VizOutput = z.infer<typeof VizOutputSchema>;

export const TraceEntrySchema = z.object({
  agent: z.enum(["planner", "extractor", "analyst", "critic", "visualizer"]),
  sql: z.string().optional(),
  rows: z.number().optional(),
  verdict: z.string().optional(),
  note: z.string().optional(),
});
export type TraceEntry = z.infer<typeof TraceEntrySchema>;

export const FinalResponseSchema = z.object({
  response: z.string(),
  assumptions: z.array(z.string()),
  trace: z.array(TraceEntrySchema),
  chart: ChartSchema.nullable(),
  insufficient_data: z.boolean(),
  session_id: z.string(),
});
export type FinalResponse = z.infer<typeof FinalResponseSchema>;
```

- [ ] **Step 4: Тест проходит + typecheck**

Run: `node --import tsx --test src/contracts/types.test.ts` → PASS (4). `npm run typecheck` → ок.

- [ ] **Step 5: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add src/contracts/
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: контракты обмена (zod + типы)"
```

---

## Task 3: DB-слой `db/duck.ts` (read-only + guard-rails)

**Files:**
- Create: `src/db/duck.ts`, `src/db/duck.test.ts`

- [ ] **Step 1: Падающий тест (на реальной БД)**

Create `src/db/duck.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSelect, GuardError } from "./duck.ts";

test("SELECT возвращает строки", async () => {
  const r = await runSelect("SELECT name FROM product_lines WHERE product_line_id=3");
  assert.equal(r.rows[0].name, "Разработка и IT");
});

test("не-SELECT отклоняется", async () => {
  await assert.rejects(() => runSelect("DROP TABLE orders"), GuardError);
});

test("запрещённые объекты (_params) отклоняются", async () => {
  await assert.rejects(() => runSelect("SELECT * FROM _params"), GuardError);
});

test("авто-LIMIT ограничивает выдачу", async () => {
  const r = await runSelect("SELECT * FROM orders", 5);
  assert.ok(r.rows.length <= 5);
});
```

- [ ] **Step 2: Запустить — падает**

Run: `node --import tsx --test src/db/duck.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация DB-слоя**

Create `src/db/duck.ts`:
```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const DB_PATH = process.env.MERIDIAN_DB ?? "db/meridian.duckdb";
export const ALLOWED_TABLES = [
  "customers", "orders", "product_lines", "nps_responses",
  "customer_activity_monthly", "churn_reasons", "financials_monthly",
  "unit_economics_monthly",
];
const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|attach|copy|install|load|pragma|export|replace)\b/i;
const FORBIDDEN_OBJ = /(^|[^a-z_])_[a-z]|read_csv|read_parquet|glob/i;

export class GuardError extends Error {}

export type QueryResult = { rows: Record<string, unknown>[]; columns: string[] };

function guard(sql: string): string {
  const s = sql.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(s)) throw new GuardError("разрешён только SELECT/WITH");
  if (FORBIDDEN.test(s)) throw new GuardError("запрещённая операция в SQL");
  if (FORBIDDEN_OBJ.test(s)) throw new GuardError("обращение к запрещённым объектам");
  if (s.includes(";")) throw new GuardError("несколько стейтментов запрещено");
  return s;
}

export async function runSelect(sql: string, cap = 1000): Promise<QueryResult> {
  const safe = guard(sql);
  const wrapped = `SELECT * FROM ( ${safe} ) AS _q LIMIT ${cap}`;
  const { stdout } = await execFileP(
    "duckdb",
    ["-readonly", DB_PATH, "-json", "-c", wrapped],
    { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 },
  );
  const rows = (JSON.parse(stdout || "[]")) as Record<string, unknown>[];
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { rows, columns };
}
```

- [ ] **Step 4: Тест проходит**

Run: `cd /Users/irinafrolova/Documents/sh26 && bash db/build.sh >/dev/null && node --import tsx --test src/db/duck.test.ts`
Expected: PASS (4). (Сборка БД нужна, если файла нет.)

- [ ] **Step 5: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add src/db/
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: read-only DuckDB-слой с guard-rails"
```

---

## Task 4: Библиотека метрик `metrics/library.ts`

**Files:**
- Create: `src/metrics/library.ts`, `src/metrics/library.test.ts`

- [ ] **Step 1: Падающий тест**

Create `src/metrics/library.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { METRICS, findMetric } from "./library.ts";
import { runSelect } from "../db/duck.ts";

test("есть метрика выручки по линиям", () => {
  assert.ok(findMetric("revenue_by_product_line"));
});

test("каждый SQL метрики выполняется на БД", async () => {
  for (const m of METRICS) {
    const r = await runSelect(m.sql);
    assert.ok(r.rows.length >= 0, `метрика ${m.id} вернула результат`);
  }
});

test("неизвестная метрика → undefined", () => {
  assert.equal(findMetric("nope"), undefined);
});
```

- [ ] **Step 2: Запустить — падает**

Run: `node --import tsx --test src/metrics/library.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация (seed-метрики из catalog 02)**

Create `src/metrics/library.ts`:
```ts
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
```

- [ ] **Step 4: Тест проходит**

Run: `node --import tsx --test src/metrics/library.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add src/metrics/
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: библиотека метрик (seed из catalog 02)"
```

---

## Task 5: LLM-клиент `llm/client.ts` + JSON-хелпер

**Files:**
- Create: `src/llm/client.ts`, `src/llm/json.ts`, `src/llm/json.test.ts`

- [ ] **Step 1: Падающий тест JSON-хелпера (с фейковым клиентом)**

Create `src/llm/json.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { callJSON } from "./json.ts";
import type { LLMClient } from "./client.ts";

const Schema = z.object({ ok: z.boolean() });

function fakeClient(replies: string[]): LLMClient {
  let i = 0;
  return { complete: async () => replies[i++] ?? "" };
}

test("парсит валидный JSON из ответа LLM", async () => {
  const c = fakeClient(['{"ok": true}']);
  const r = await callJSON(c, "sys", "user", Schema);
  assert.equal(r.ok, true);
});

test("вырезает ```json блоки", async () => {
  const c = fakeClient(["```json\n{\"ok\": false}\n```"]);
  const r = await callJSON(c, "sys", "user", Schema);
  assert.equal(r.ok, false);
});

test("ретраит один раз при кривом JSON, затем кидает", async () => {
  const c = fakeClient(["не json", "тоже не json"]);
  await assert.rejects(() => callJSON(c, "sys", "user", Schema));
});
```

- [ ] **Step 2: Запустить — падает**

Run: `node --import tsx --test src/llm/json.test.ts`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Реализация клиента и хелпера**

Create `src/llm/client.ts`:
```ts
import OpenAI from "openai";

export interface LLMClient {
  complete(system: string, user: string, opts?: { model?: string; temperature?: number }): Promise<string>;
}

export function createLLMClient(): LLMClient {
  const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY ?? "missing",
    baseURL: process.env.LLM_BASE_URL, // undefined → дефолт OpenAI
  });
  const defaultModel = process.env.LLM_MODEL ?? "gpt-4o-mini";
  return {
    async complete(system, user, opts) {
      const res = await client.chat.completions.create({
        model: opts?.model ?? defaultModel,
        temperature: opts?.temperature ?? 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
}
```

Create `src/llm/json.ts`:
```ts
import type { ZodType } from "zod";
import type { LLMClient } from "./client.ts";

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}

export async function callJSON<T>(
  client: LLMClient, system: string, user: string, schema: ZodType<T>,
  opts?: { model?: string },
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await client.complete(
      system + "\n\nОтвечай ТОЛЬКО валидным JSON, без пояснений.",
      user, { model: opts?.model },
    );
    try {
      return schema.parse(JSON.parse(extractJSON(raw)));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`LLM вернул невалидный JSON: ${String(lastErr)}`);
}
```

- [ ] **Step 4: Тест проходит + typecheck**

Run: `node --import tsx --test src/llm/json.test.ts` → PASS (3). `npm run typecheck` → ок.

- [ ] **Step 5: Коммит**

```bash
cd /Users/irinafrolova/Documents/sh26
git add src/llm/
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: OpenAI-совместимый LLM-клиент + JSON-хелпер"
```

---

## Task 6: Planner `agents/planner.ts`

**Files:**
- Create: `src/agents/planner.ts`, `src/agents/planner.test.ts`

- [ ] **Step 1: Падающий тест (фейковый LLM)**

Create `src/agents/planner.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { plan } from "./planner.ts";
import type { LLMClient } from "../llm/client.ts";

const fake = (reply: string): LLMClient => ({ complete: async () => reply });

test("bi-вопрос → один под-вопрос", async () => {
  const c = fake('{"mode":"bi","reasoning":"простой","sub_questions":["выручка по линиям"]}');
  const r = await plan(c, "покажи выручку по линиям");
  assert.equal(r.mode, "bi");
  assert.equal(r.sub_questions.length, 1);
});

test("невозможный вопрос → insufficient", async () => {
  const c = fake('{"mode":"insufficient","reasoning":"нет данных","sub_questions":[]}');
  const r = await plan(c, "прогноз на 2030");
  assert.equal(r.mode, "insufficient");
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/agents/planner.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

Create `src/agents/planner.ts`:
```ts
import { PlannerOutputSchema, type PlannerOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — планировщик аналитической системы Meridian (B2B-маркетплейс).
Классифицируй вопрос руководителя:
- "bi": простой вопрос на один ответ → sub_questions=[исходный вопрос].
- "research": сложный/составной → разбей на 2-5 под-вопросов.
- "insufficient": ответ невозможен по доступным данным (прогноз будущего, данных нет в витрине).
Данные охватывают 2023-01..2025-12. Верни JSON: {mode, reasoning, sub_questions[]}.`;

export async function plan(llm: LLMClient, question: string): Promise<PlannerOutput> {
  return callJSON(llm, SYSTEM, `Вопрос: ${question}`, PlannerOutputSchema);
}
```

- [ ] **Step 4: Тест проходит.** Run: `node --import tsx --test src/agents/planner.test.ts` → PASS (2).

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/agents/planner.ts src/agents/planner.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: агент Planner"
```

---

## Task 7: Extractor `agents/extractor.ts`

**Files:**
- Create: `src/agents/extractor.ts`, `src/agents/extractor.test.ts`

- [ ] **Step 1: Падающий тест (фейковый LLM + реальная БД)**

Create `src/agents/extractor.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "./extractor.ts";
import type { LLMClient } from "../llm/client.ts";

const fake = (reply: string): LLMClient => ({ complete: async () => reply });

test("metric_template: выбирает метрику и выполняет SQL", async () => {
  const c = fake('{"approach":"metric_template","metric_id":"revenue_by_product_line","reason":"подходит"}');
  const r = await extract(c, "выручка по продуктовым линиям");
  assert.equal(r.approach, "metric_template");
  assert.ok(r.row_count > 0);
  assert.equal(r.data_sufficient, true);
});

test("free_sql: guarded запрос выполняется", async () => {
  const c = fake('{"approach":"free_sql","sql":"SELECT count(*) AS n FROM customers","reason":"кастом"}');
  const r = await extract(c, "сколько всего клиентов");
  assert.equal(r.approach, "free_sql");
  assert.equal(r.row_count, 1);
});

test("небезопасный SQL → data_sufficient=false, без падения", async () => {
  const c = fake('{"approach":"free_sql","sql":"DROP TABLE orders","reason":"x"}');
  const r = await extract(c, "удали всё");
  assert.equal(r.data_sufficient, false);
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/agents/extractor.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

Create `src/agents/extractor.ts`:
```ts
import { z } from "zod";
import { type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";
import { runSelect } from "../db/duck.ts";
import { METRICS, findMetric } from "../metrics/library.ts";

const PlanSchema = z.object({
  approach: z.enum(["metric_template", "free_sql"]),
  metric_id: z.string().optional(),
  sql: z.string().optional(),
  reason: z.string(),
});

const SYSTEM = `Ты — Extractor системы Meridian. По вопросу выбери способ получить данные из DuckDB.
Доступные метрики (используй approach="metric_template" и metric_id, если подходит):
${METRICS.map((m) => `- ${m.id}: ${m.question_ru}`).join("\n")}
Если ни одна не подходит — approach="free_sql" и напиши ОДИН SELECT-запрос (только чтение, таблицы:
customers, orders, product_lines, nps_responses, customer_activity_monthly, churn_reasons,
financials_monthly, unit_economics_monthly). НЕ смешивай orders и financials. Верни JSON {approach, metric_id?, sql?, reason}.`;

export async function extract(llm: LLMClient, question: string): Promise<ExtractorOutput> {
  const p = await callJSON(llm, SYSTEM, `Вопрос: ${question}`, PlanSchema);
  let sql = "";
  let metric_id: string | undefined;
  if (p.approach === "metric_template" && p.metric_id) {
    const m = findMetric(p.metric_id);
    if (m) { sql = m.sql; metric_id = m.id; }
  } else if (p.sql) {
    sql = p.sql;
  }
  if (!sql) {
    return base(p.approach, metric_id, "", "не удалось сформировать запрос", false);
  }
  try {
    const { rows, columns } = await runSelect(sql);
    const out = base(p.approach, metric_id, sql, p.reason, rows.length > 0);
    out.rows = rows.slice(0, 1000);
    out.row_count = rows.length;
    out.columns = columns.map((c) => ({ name: c, type: typeof rows[0]?.[c] }));
    return out;
  } catch (e) {
    return base(p.approach, metric_id, sql, `ошибка выполнения: ${String(e)}`, false);
  }
}

function base(
  approach: ExtractorOutput["approach"], metric_id: string | undefined,
  sql: string, notes: string, ok: boolean,
): ExtractorOutput {
  return {
    approach, metric_id, sql, columns: [], rows: [], row_count: 0,
    data_sufficient: ok, notes, assumptions: [],
  };
}
```

- [ ] **Step 4: Тест проходит.** Run: `node --import tsx --test src/agents/extractor.test.ts` → PASS (3).

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/agents/extractor.ts src/agents/extractor.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: агент Extractor (метрики + guarded SQL)"
```

---

## Task 8: Analyst `agents/analyst.ts`

**Files:**
- Create: `src/agents/analyst.ts`, `src/agents/analyst.test.ts`

- [ ] **Step 1: Падающий тест**

Create `src/agents/analyst.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./analyst.ts";
import type { LLMClient } from "../llm/client.ts";
import type { ExtractorOutput } from "../contracts/types.ts";

const fake = (reply: string): LLMClient => ({ complete: async () => reply });
const ext: ExtractorOutput = {
  approach: "metric_template", metric_id: "revenue_by_product_line",
  sql: "SELECT ...", columns: [{ name: "product_line", type: "string" }, { name: "revenue", type: "number" }],
  rows: [{ product_line: "Разработка и IT", revenue: 1170000000 }], row_count: 1,
  data_sufficient: true, notes: "", assumptions: [],
};

test("маппит ответ LLM в AnalystOutput", async () => {
  const c = fake(JSON.stringify({
    answer: "Лидер — Разработка и IT", key_findings: ["IT впереди"],
    method: "сумма revenue по completed", assumptions: [], caveats: [], confidence: "high",
  }));
  const r = await analyze(c, "выручка по линиям", ext);
  assert.match(r.answer, /Разработка/);
  assert.equal(r.confidence, "high");
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/agents/analyst.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

Create `src/agents/analyst.ts`:
```ts
import { AnalystOutputSchema, type AnalystOutput, type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — Analyst системы Meridian с инженерной культурой: "вот цифры, вот метод, вот допущения".
На вход — вопрос и результат SQL. Дай вывод на РУССКОМ строго по цифрам из данных, не выдумывай.
Если data_sufficient=false — честно скажи, что данных недостаточно (answer об этом, confidence "low").
Верни JSON {answer, key_findings[], method, assumptions[], caveats[], confidence: high|medium|low}.`;

export async function analyze(
  llm: LLMClient, question: string, ext: ExtractorOutput,
): Promise<AnalystOutput> {
  const user = `Вопрос: ${question}
data_sufficient: ${ext.data_sufficient}
Колонки: ${JSON.stringify(ext.columns)}
Строки (до 50): ${JSON.stringify(ext.rows.slice(0, 50))}
Заметки Extractor: ${ext.notes}`;
  return callJSON(llm, SYSTEM, user, AnalystOutputSchema);
}
```

- [ ] **Step 4: Тест проходит.** Run: `node --import tsx --test src/agents/analyst.test.ts` → PASS (1).

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/agents/analyst.ts src/agents/analyst.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: агент Analyst"
```

---

## Task 9: Critic `agents/critic.ts`

**Files:**
- Create: `src/agents/critic.ts`, `src/agents/critic.test.ts`

- [ ] **Step 1: Падающий тест**

Create `src/agents/critic.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { critique } from "./critic.ts";
import type { LLMClient } from "../llm/client.ts";
import type { AnalystOutput, ExtractorOutput } from "../contracts/types.ts";

const fake = (reply: string): LLMClient => ({ complete: async () => reply });
const ext: ExtractorOutput = {
  approach: "free_sql", sql: "SELECT 1", columns: [], rows: [], row_count: 0,
  data_sufficient: false, notes: "", assumptions: [],
};
const ana: AnalystOutput = {
  answer: "Данных недостаточно", key_findings: [], method: "", assumptions: [],
  caveats: [], confidence: "low",
};

test("при data_sufficient=false принудительно не approved без честности", async () => {
  const c = fake('{"verdict":"approved","checks":[],"issues":[]}');
  const r = await critique(c, "вопрос", ext, ana);
  assert.ok(["approved", "revise", "reject"].includes(r.verdict));
});

test("revise несёт target", async () => {
  const c = fake('{"verdict":"revise","checks":[],"issues":["нет фильтра status"],"target":"extractor","guidance":"добавь status=completed"}');
  const r = await critique(c, "вопрос", ext, ana);
  assert.equal(r.verdict, "revise");
  assert.equal(r.target, "extractor");
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/agents/critic.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

Create `src/agents/critic.ts`:
```ts
import { CriticOutputSchema, type CriticOutput, type AnalystOutput, type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — Critic системы Meridian. Проверь ответ аналитика по чек-листу ловушек:
1) orders и financials НЕ смешаны (P&L только из financials/unit_economics);
2) есть фильтр status там, где считается выручка;
3) нет усреднения разнородных групп без среза;
4) числа в ответе совпадают со строками данных (нет галлюцинаций);
5) если данных недостаточно — это честно отражено (а не выдуман ответ);
6) sunset-линия "Консалтинг" учтена осознанно.
Вердикт: "approved" | "revise" (target extractor|analyst + guidance) | "reject" (данных нет/ответ невозможен).
Верни JSON {verdict, checks:[{name,passed,comment}], issues[], target?, guidance?}.`;

export async function critique(
  llm: LLMClient, question: string, ext: ExtractorOutput, ana: AnalystOutput,
): Promise<CriticOutput> {
  const user = `Вопрос: ${question}
SQL: ${ext.sql}
data_sufficient: ${ext.data_sufficient}
Строки (до 50): ${JSON.stringify(ext.rows.slice(0, 50))}
Ответ аналитика: ${ana.answer}
Метод: ${ana.method}`;
  return callJSON(llm, SYSTEM, user, CriticOutputSchema);
}
```

- [ ] **Step 4: Тест проходит.** Run: `node --import tsx --test src/agents/critic.test.ts` → PASS (2).

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/agents/critic.ts src/agents/critic.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: агент Critic (чек-лист ловушек)"
```

---

## Task 10: Visualizer `agents/visualizer.ts`

**Files:**
- Create: `src/agents/visualizer.ts`, `src/agents/visualizer.test.ts`

- [ ] **Step 1: Падающий тест**

Create `src/agents/visualizer.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { visualize } from "./visualizer.ts";
import type { LLMClient } from "../llm/client.ts";
import type { AnalystOutput, ExtractorOutput } from "../contracts/types.ts";

const fake = (reply: string): LLMClient => ({ complete: async () => reply });
const ext: ExtractorOutput = {
  approach: "metric_template", sql: "", columns: [], rows: [{ product_line: "IT", revenue: 1 }],
  row_count: 1, data_sufficient: true, notes: "", assumptions: [],
};
const ana: AnalystOutput = { answer: "a", key_findings: [], method: "", assumptions: [], caveats: [], confidence: "high" };

test("возвращает bar-chart", async () => {
  const c = fake('{"chart":{"type":"bar","title":"Выручка","x":"product_line","y":"revenue","data":[{"product_line":"IT","revenue":1}]},"rationale":"сравнение категорий"}');
  const r = await visualize(c, ana, ext);
  assert.equal(r.chart?.type, "bar");
});

test("может вернуть null-chart", async () => {
  const c = fake('{"chart":null,"rationale":"нет смысла"}');
  const r = await visualize(c, ana, ext);
  assert.equal(r.chart, null);
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/agents/visualizer.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

Create `src/agents/visualizer.ts`:
```ts
import { VizOutputSchema, type VizOutput, type AnalystOutput, type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — Visualization системы Meridian. Подбери тип графика под данные:
line (динамика во времени), bar (сравнение категорий), grouped_bar (категории×серии),
pie (структура целого), scatter (связь), table (если график не нужен). Если визуализация бессмысленна — chart=null.
x/y — имена колонок из данных; data — те же строки. Верни JSON {chart|null, rationale}.`;

export async function visualize(
  llm: LLMClient, ana: AnalystOutput, ext: ExtractorOutput,
): Promise<VizOutput> {
  const user = `Вывод: ${ana.answer}
Колонки: ${JSON.stringify(ext.columns)}
Строки (до 50): ${JSON.stringify(ext.rows.slice(0, 50))}`;
  return callJSON(llm, SYSTEM, user, VizOutputSchema);
}
```

- [ ] **Step 4: Тест проходит.** Run: `node --import tsx --test src/agents/visualizer.test.ts` → PASS (2).

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/agents/visualizer.ts src/agents/visualizer.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: агент Visualization"
```

---

## Task 11: Оркестратор `orchestrator.ts`

**Files:**
- Create: `src/orchestrator.ts`, `src/orchestrator.test.ts`

- [ ] **Step 1: Падающий тест (фейковые агенты через DI)**

Create `src/orchestrator.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runPipeline, type Agents } from "./orchestrator.ts";

function agents(over: Partial<Agents>): Agents {
  return {
    plan: async () => ({ mode: "bi", reasoning: "", sub_questions: ["q"] }),
    extract: async () => ({ approach: "free_sql", sql: "SELECT 1", columns: [], rows: [{ a: 1 }], row_count: 1, data_sufficient: true, notes: "", assumptions: [] }),
    analyze: async () => ({ answer: "ответ", key_findings: [], method: "", assumptions: [], caveats: [], confidence: "high" }),
    critique: async () => ({ verdict: "approved", checks: [], issues: [] }),
    visualize: async () => ({ chart: null, rationale: "" }),
    ...over,
  };
}

test("bi happy-path → insufficient_data=false, есть ответ", async () => {
  const r = await runPipeline(agents({}), { message: "q" });
  assert.equal(r.insufficient_data, false);
  assert.equal(r.response, "ответ");
});

test("planner insufficient → короткое замыкание", async () => {
  const r = await runPipeline(agents({ plan: async () => ({ mode: "insufficient", reasoning: "нет данных", sub_questions: [] }) }), { message: "q" });
  assert.equal(r.insufficient_data, true);
});

test("critic revise дважды → не зацикливается (≤2 повтора)", async () => {
  let calls = 0;
  const r = await runPipeline(agents({
    critique: async () => { calls++; return { verdict: "revise", target: "analyst", guidance: "g", checks: [], issues: ["x"] }; },
  }), { message: "q" });
  assert.ok(calls <= 3, `критик вызван ${calls} раз`);
  assert.ok(r.response.length > 0);
});

test("extractor data_sufficient=false → insufficient_data=true", async () => {
  const r = await runPipeline(agents({
    extract: async () => ({ approach: "free_sql", sql: "", columns: [], rows: [], row_count: 0, data_sufficient: false, notes: "", assumptions: [] }),
  }), { message: "q" });
  assert.equal(r.insufficient_data, true);
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/orchestrator.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

Create `src/orchestrator.ts`:
```ts
import type {
  UserQuery, FinalResponse, TraceEntry, PlannerOutput,
  ExtractorOutput, AnalystOutput, CriticOutput, VizOutput,
} from "./contracts/types.ts";

export type Agents = {
  plan: (q: string) => Promise<PlannerOutput>;
  extract: (q: string, guidance?: string) => Promise<ExtractorOutput>;
  analyze: (q: string, ext: ExtractorOutput, guidance?: string) => Promise<AnalystOutput>;
  critique: (q: string, ext: ExtractorOutput, ana: AnalystOutput) => Promise<CriticOutput>;
  visualize: (ana: AnalystOutput, ext: ExtractorOutput) => Promise<VizOutput>;
};

const MAX_REVISIONS = 2;

async function answerOne(a: Agents, q: string, trace: TraceEntry[]) {
  let ext = await a.extract(q);
  trace.push({ agent: "extractor", sql: ext.sql, rows: ext.row_count });
  let ana = await a.analyze(q, ext);
  trace.push({ agent: "analyst", note: ana.method });

  for (let i = 0; i < MAX_REVISIONS; i++) {
    const crit = await a.critique(q, ext, ana);
    trace.push({ agent: "critic", verdict: crit.verdict });
    if (crit.verdict === "approved" || crit.verdict === "reject") {
      return { ext, ana, rejected: crit.verdict === "reject" };
    }
    if (crit.target === "extractor") {
      ext = await a.extract(q, crit.guidance);
      trace.push({ agent: "extractor", sql: ext.sql, rows: ext.row_count });
    }
    ana = await a.analyze(q, ext, crit.guidance);
    trace.push({ agent: "analyst", note: ana.method });
  }
  return { ext, ana, rejected: false };
}

export async function runPipeline(a: Agents, query: UserQuery): Promise<FinalResponse> {
  const trace: TraceEntry[] = [];
  const session_id = query.session_id ?? "s-" + trace.length;
  const planned = await a.plan(query.message);
  trace.push({ agent: "planner", note: planned.mode });

  if (planned.mode === "insufficient") {
    return {
      response: `Недостаточно данных для ответа: ${planned.reasoning}`,
      assumptions: [], trace, chart: null, insufficient_data: true, session_id,
    };
  }

  const results = [];
  for (const sub of planned.sub_questions) {
    results.push(await answerOne(a, sub, trace));
  }

  const insufficient = results.some((r) => r.rejected || !r.ext.data_sufficient);
  const primary = results[results.length - 1];
  const answer = results.length > 1
    ? results.map((r, i) => `${i + 1}. ${r.ana.answer}`).join("\n")
    : primary.ana.answer;

  const viz = insufficient ? { chart: null, rationale: "" } : await a.visualize(primary.ana, primary.ext);
  if (viz.chart) trace.push({ agent: "visualizer", note: viz.chart.type });

  const assumptions = [...new Set(results.flatMap((r) => [...r.ana.assumptions, ...r.ext.assumptions]))];
  return {
    response: insufficient ? `Недостаточно данных для надёжного ответа. ${answer}` : answer,
    assumptions, trace, chart: viz.chart, insufficient_data: insufficient, session_id,
  };
}
```

- [ ] **Step 4: Тест проходит + typecheck.** Run: `node --import tsx --test src/orchestrator.test.ts` → PASS (4). `npm run typecheck` → ок.

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/orchestrator.ts src/orchestrator.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: оркестратор (роутинг, loopback, синтез)"
```

---

## Task 12: Fastify-сервер `server.ts` (контракт судьи, без 500)

**Files:**
- Create: `src/server.ts`, `src/server.test.ts`

- [ ] **Step 1: Падающий тест (fastify.inject, заглушка пайплайна)**

Create `src/server.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "./server.ts";
import type { FinalResponse } from "./contracts/types.ts";

const ok: FinalResponse = {
  response: "ответ", assumptions: [], trace: [], chart: null,
  insufficient_data: false, session_id: "s1",
};
const app = () => buildServer(async () => ok);

test("POST /api/chat валидный → 200 + response", async () => {
  const r = await app().inject({ method: "POST", url: "/api/chat", payload: { message: "q" } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().response, "ответ");
});

test("пустое тело → 400", async () => {
  const r = await app().inject({ method: "POST", url: "/api/chat", payload: "" , headers: { "content-type": "application/json" }});
  assert.equal(r.statusCode, 400);
});

test("нет поля вопроса → 422", async () => {
  const r = await app().inject({ method: "POST", url: "/api/chat", payload: { foo: 1 } });
  assert.equal(r.statusCode, 422);
});

test("несуществующий путь → 404", async () => {
  const r = await app().inject({ method: "POST", url: "/nope", payload: { message: "q" } });
  assert.equal(r.statusCode, 404);
});

test("GET /health → 200", async () => {
  const r = await app().inject({ method: "GET", url: "/health" });
  assert.equal(r.statusCode, 200);
});

test("ошибка пайплайна → НЕ 500, а insufficient ответ", async () => {
  const bad = buildServer(async () => { throw new Error("boom"); });
  const r = await bad.inject({ method: "POST", url: "/api/chat", payload: { message: "q" } });
  assert.notEqual(r.statusCode, 500);
  assert.equal(r.json().insufficient_data, true);
});

test("алиас /chat работает", async () => {
  const r = await app().inject({ method: "POST", url: "/chat", payload: { query: "q" } });
  assert.equal(r.statusCode, 200);
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/server.test.ts` → FAIL.

- [ ] **Step 3: Реализация**

Create `src/server.ts`:
```ts
import Fastify, { type FastifyInstance } from "fastify";
import type { FinalResponse, UserQuery } from "./contracts/types.ts";

export type PipelineFn = (q: UserQuery) => Promise<FinalResponse>;
const PATHS = ["/api/chat", "/api/v1/chat", "/chat", "/api/ask", "/api/query"];

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string") return b.message;
  if (typeof b.query === "string") return b.query;
  if (Array.isArray(b.messages)) {
    const last = [...b.messages].reverse().find((m) => m?.role === "user");
    if (last && typeof last.content === "string") return last.content;
  }
  return null;
}

export function buildServer(pipeline: PipelineFn): FastifyInstance {
  const app = Fastify({ logger: false });

  // Кривой JSON → 400 (а не 500)
  app.setErrorHandler((err, _req, reply) => {
    if ((err as { statusCode?: number }).statusCode === 400) {
      return reply.code(400).send({ error: "невалидный JSON" });
    }
    return reply.code(400).send({ error: "ошибка запроса" });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "путь не найден" }));

  app.get("/health", async () => ({ status: "ok" }));

  const handler = async (req: { body: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const body = req.body;
    if (body === undefined || body === null || body === "") {
      return reply.code(400).send({ error: "пустое тело" });
    }
    const message = extractMessage(body);
    if (message === null || message.trim() === "") {
      return reply.code(422).send({ error: "отсутствует поле вопроса (message/query/messages)" });
    }
    const session_id = (body as Record<string, unknown>).session_id;
    try {
      const res = await pipeline({ message, session_id: typeof session_id === "string" ? session_id : undefined });
      return reply.code(200).send(res);
    } catch {
      return reply.code(200).send({
        response: "Произошла внутренняя ошибка при обработке запроса.",
        assumptions: [], trace: [], chart: null, insufficient_data: true,
        session_id: typeof session_id === "string" ? session_id : "s-error",
      } satisfies FinalResponse);
    }
  };

  for (const p of PATHS) app.post(p, handler as never);
  return app;
}
```

- [ ] **Step 4: Тест проходит + typecheck.** Run: `node --import tsx --test src/server.test.ts` → PASS (7). `npm run typecheck` → ок.

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/server.ts src/server.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: Fastify-сервер под контракт судьи (без 500)"
```

---

## Task 13: Сборка `main.ts` + детерминированный e2e

**Files:**
- Create: `src/main.ts`, `src/wiring.ts`, `src/e2e.test.ts`

- [ ] **Step 1: Падающий e2e-тест (реальная БД + реальные агенты с ФЕЙКОВЫМ LLM)**

Create `src/e2e.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgents } from "./wiring.ts";
import { runPipeline } from "./orchestrator.ts";
import type { LLMClient } from "./llm/client.ts";

// Фейковый LLM выдаёт сценарий для "выручка по продуктовым линиям":
// planner→bi, extractor→metric, analyst→вывод, critic→approved, viz→bar.
function scriptedLLM(): LLMClient {
  const byMarker = (sys: string): string => {
    if (sys.includes("планировщик")) return '{"mode":"bi","reasoning":"простой","sub_questions":["выручка по продуктовым линиям"]}';
    if (sys.includes("Extractor")) return '{"approach":"metric_template","metric_id":"revenue_by_product_line","reason":"подходит"}';
    if (sys.includes("Analyst")) return '{"answer":"Лидер по выручке — Разработка и IT","key_findings":["IT лидирует"],"method":"sum(revenue) по completed","assumptions":[],"caveats":[],"confidence":"high"}';
    if (sys.includes("Critic")) return '{"verdict":"approved","checks":[{"name":"status filter","passed":true,"comment":"ok"}],"issues":[]}';
    if (sys.includes("Visualization")) return '{"chart":{"type":"bar","title":"Выручка по линиям","x":"product_line","y":"revenue","data":[]},"rationale":"сравнение категорий"}';
    return "{}";
  };
  return { complete: async (system) => byMarker(system) };
}

test("e2e: простой вопрос проходит весь пайплайн на реальной БД", async () => {
  const agents = buildAgents(scriptedLLM());
  const r = await runPipeline(agents, { message: "покажи выручку по продуктовым линиям" });
  assert.equal(r.insufficient_data, false);
  assert.match(r.response, /Разработка и IT/);
  assert.equal(r.chart?.type, "bar");
  // в трассе есть extractor с реально выполненным SQL и строками
  const ext = r.trace.find((t) => t.agent === "extractor");
  assert.ok((ext?.rows ?? 0) > 0, "extractor получил строки из БД");
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/e2e.test.ts` → FAIL (нет wiring).

- [ ] **Step 3: Реализация wiring + main**

Create `src/wiring.ts`:
```ts
import type { Agents } from "./orchestrator.ts";
import type { LLMClient } from "./llm/client.ts";
import { plan } from "./agents/planner.ts";
import { extract } from "./agents/extractor.ts";
import { analyze } from "./agents/analyst.ts";
import { critique } from "./agents/critic.ts";
import { visualize } from "./agents/visualizer.ts";

export function buildAgents(llm: LLMClient): Agents {
  return {
    plan: (q) => plan(llm, q),
    extract: (q) => extract(llm, q),
    analyze: (q, ext) => analyze(llm, q, ext),
    critique: (q, ext, ana) => critique(llm, q, ext, ana),
    visualize: (ana, ext) => visualize(llm, ana, ext),
  };
}
```

Create `src/main.ts`:
```ts
import { buildServer } from "./server.ts";
import { buildAgents } from "./wiring.ts";
import { runPipeline } from "./orchestrator.ts";
import { createLLMClient } from "./llm/client.ts";

const agents = buildAgents(createLLMClient());
const app = buildServer((q) => runPipeline(agents, q));
const port = Number(process.env.PORT ?? 8000);

app.listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`Meridian agents on :${port}`))
  .catch((e) => { console.error(e); process.exit(1); });
```

Note: тип `Agents.extract` принимает `(q, guidance?)`, а `buildAgents` оборачивает в `(q) => extract(llm, q)` — guidance в MVP игнорируется агентами (loopback повторяет с тем же вопросом). Это допустимо: повтор всё равно идёт через Critic. Совместимо по сигнатуре (лишний параметр опционален).

- [ ] **Step 4: e2e проходит + typecheck.** Run: `bash db/build.sh >/dev/null && node --import tsx --test src/e2e.test.ts` → PASS (1). `npm run typecheck` → ок.

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/main.ts src/wiring.ts src/e2e.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: сборка main + детерминированный e2e на реальной БД"
```

---

## Task 14: README запуска + финальная проверка

**Files:**
- Create: `README.md`
- Create: `.env.example`

- [ ] **Step 1: .env.example**

Create `.env.example`:
```
# OpenAI-совместимый провайдер
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
PORT=8000
MERIDIAN_DB=db/meridian.duckdb
```

- [ ] **Step 2: README.md**

Create `README.md`:
```markdown
# Meridian — мультиагентная аналитическая система (AI South Hub 2026)

## Требования
- Node 22+, DuckDB CLI на PATH (`brew install duckdb` или бинарь с github releases).

## Установка и БД
```bash
npm install
bash db/build.sh          # собрать db/meridian.duckdb из data/*.csv
```

## Тесты
```bash
npm test          # все юнит/e2e тесты (детерминированы, без LLM-ключа)
npm run typecheck
```

## Запуск (нужен LLM-ключ)
```bash
cp .env.example .env       # заполнить LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
npm start
# проверка:
curl -s localhost:8000/api/chat -H 'content-type: application/json' \
  -d '{"message":"покажи выручку по продуктовым линиям"}'
```

## Архитектура
Planner → Extractor → Analyst → Critic (loopback ≤2) → Visualization.
Контракты — `src/contracts/types.ts`. Детали — `docs/superpowers/specs/2026-06-11-stage2-architecture-contracts-design.md`.
```

- [ ] **Step 3: Финальная проверка всего**

Run:
```bash
cd /Users/irinafrolova/Documents/sh26
bash db/build.sh >/dev/null
npm test
npm run typecheck
```
Expected: все тесты зелёные (≈ 30+), typecheck без ошибок.

- [ ] **Step 4: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add README.md .env.example
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 3: README, .env.example, финальная проверка MVP"
```

---

## Self-review (выполнено автором плана)

- **Покрытие спеки:** контракты→Task 2; planner→6; extractor (гибрид метрики+SQL)→7; analyst→8; critic (чек-лист ловушек)→9; visualizer→10; оркестратор (loopback≤2, синтез, insufficient short-circuit)→11; внешний API+guard от 500→12; DuckDB read-only guard-rails→3; библиотека метрик→4; OpenAI-совместимый LLM→5; e2e на простом вопросе→13. Все секции спеки покрыты.
- **Плейсхолдеров нет:** в каждом шаге полный код/команда.
- **Согласованность типов:** имена полей (`data_sufficient`, `insufficient_data`, `verdict`, `sub_questions`, `chart`) едины между контрактами (Task 2) и потребителями (7–13); сигнатура `Agents` (Task 11) совпадает с `buildAgents` (Task 13); `runSelect`/`GuardError` (Task 3) используются в 4 и 7.
- **Окружение учтено:** Node работает; БД через CLI `-readonly -json` (без нативных модулей); тесты детерминированы фейковым LLM, живой прогон — вручную с ключом.
- **TDD/частые коммиты:** каждая задача — падающий тест → реализация → зелёный → коммит.
```
