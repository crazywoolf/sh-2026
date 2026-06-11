# Этап 5 — Дашборд, UX и три режима: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий SPA на токенах Gravity UI с тремя режимами (Диалоговый BI с контекстом / Ad-hoc исследование с декомпозицией / Отчёты по расписанию) поверх готового бэкенда, плюс контекст сессий и реальный планировщик отчётов.

**Architecture:** Бэкенд расширяется аддитивно: SessionStore (контекст диалога), presets+report (сводный отчёт здоровья), delivery (инбокс + опц. webhook/Telegram), scheduler (node-cron). Только Planner потребляет контекст диалога (разрешает уточнения в самодостаточные под-вопросы) — остальные агенты без изменений. Fastify раздаёт статику `web/` и новые `/api/*`. Контракт судьи дополнен опциональными полями.

**Tech Stack:** Node 22, TypeScript, tsx, node:test, Fastify, zod, node-cron (новая зависимость, чистый JS), Chart.js (CDN), Gravity UI токены (CSS).

**Источник:** спека [../specs/2026-06-11-stage5-dashboard-ux-design.md](../specs/2026-06-11-stage5-dashboard-ux-design.md). Тесты — `npm test`; импорты в src с `.ts`; коммиты `git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit`.

---

## Task 1: Контракты — `plan`, `sub_answers`, `prefer_research`

**Files:** Modify `src/contracts/types.ts`; Modify `src/contracts/types.test.ts`

- [ ] **Step 1: Падающий тест**

Добавить в `src/contracts/types.test.ts`:
```ts
import { FinalResponseSchema as FR2, UserQuerySchema } from "./types.ts";

test("FinalResponse: опциональные plan и sub_answers парсятся", () => {
  const v = FR2.parse({
    response: "ответ", assumptions: [], trace: [], chart: null,
    insufficient_data: false, session_id: "s1",
    plan: { mode: "research", sub_questions: ["a", "b"] }, sub_answers: ["x", "y"],
  });
  assert.equal(v.plan?.mode, "research");
  assert.equal(v.sub_answers?.length, 2);
});

test("UserQuery: prefer_research опционален", () => {
  const v = UserQuerySchema.parse({ message: "q", prefer_research: true });
  assert.equal(v.prefer_research, true);
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/contracts/types.test.ts` → FAIL.

- [ ] **Step 3: Реализация.** В `src/contracts/types.ts`:

Заменить `UserQuerySchema`:
```ts
export const UserQuerySchema = z.object({
  message: z.string(),
  session_id: z.string().optional(),
  prefer_research: z.boolean().optional(),
});
```

Добавить перед `FinalResponseSchema`:
```ts
export const PlanSummarySchema = z.object({
  mode: z.enum(["bi", "research", "insufficient"]),
  sub_questions: z.array(z.string()),
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
```

В `FinalResponseSchema` добавить два поля (после `session_id`):
```ts
  plan: PlanSummarySchema.optional(),
  sub_answers: z.array(z.string()).optional(),
```

- [ ] **Step 4: Тест проходит + typecheck.** Run: `node --import tsx --test src/contracts/types.test.ts` → PASS; `npm run typecheck` → ок.

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/contracts/
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 5: контракт +plan/+sub_answers/+prefer_research (опционально)"
```

---

## Task 2: SessionStore — контекст диалога

**Files:** Create `src/session/store.ts`, `src/session/store.test.ts`

- [ ] **Step 1: Падающий тест**

Create `src/session/store.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionStore } from "./store.ts";

test("append/get возвращает историю по session_id", () => {
  const s = new SessionStore(3);
  s.append("a", "вопрос1", "ответ1");
  s.append("a", "вопрос2", "ответ2");
  const turns = s.get("a");
  assert.equal(turns.length, 2);
  assert.equal(turns[1].question, "вопрос2");
});

test("разные сессии изолированы; пустая сессия → []", () => {
  const s = new SessionStore(3);
  s.append("a", "q", "ans");
  assert.deepEqual(s.get("b"), []);
});

test("хранит не более K последних пар", () => {
  const s = new SessionStore(2);
  s.append("a", "q1", "a1");
  s.append("a", "q2", "a2");
  s.append("a", "q3", "a3");
  const turns = s.get("a");
  assert.equal(turns.length, 2);
  assert.equal(turns[0].question, "q2");
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/session/store.test.ts` → FAIL.

- [ ] **Step 3: Реализация.** Create `src/session/store.ts`:
```ts
export type Turn = { question: string; answer: string };

export class SessionStore {
  private map = new Map<string, Turn[]>();
  constructor(private readonly limit = 5) {}

  get(sessionId: string): Turn[] {
    return this.map.get(sessionId) ?? [];
  }

  append(sessionId: string, question: string, answer: string): void {
    const turns = this.map.get(sessionId) ?? [];
    turns.push({ question, answer });
    while (turns.length > this.limit) turns.shift();
    this.map.set(sessionId, turns);
  }
}
```

- [ ] **Step 4: Тест проходит.** Run: `node --import tsx --test src/session/store.test.ts` → PASS (3). `npm run typecheck` → ок.

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/session/
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 5: SessionStore (контекст диалога)"
```

---

## Task 3: Planner и оркестратор — контекст, prefer_research, plan/sub_answers

**Files:** Modify `src/agents/planner.ts`, `src/orchestrator.ts`, `src/wiring.ts`, `src/agents/planner.test.ts`, `src/orchestrator.test.ts`

- [ ] **Step 1: Падающий тест планнера (контекст + prefer_research)**

Добавить в `src/agents/planner.test.ts`:
```ts
test("prefer_research передаётся, контекст склеивается в user-промпт (не падает)", async () => {
  let seenUser = "";
  const c: LLMClient = { complete: async (_s, u) => { seenUser = u; return '{"mode":"research","reasoning":"r","sub_questions":["A","B"]}'; } };
  const r = await plan(c, "а по сегментам?", { context: [{ question: "LTV/CAC?", answer: "по сегментам..." }], preferResearch: true });
  assert.equal(r.mode, "research");
  assert.match(seenUser, /LTV\/CAC/); // контекст попал в промпт
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/agents/planner.test.ts` → FAIL (plan не принимает opts).

- [ ] **Step 3: Обновить `src/agents/planner.ts`**

Заменить функцию `plan` и импорт типа:
```ts
import { PlannerOutputSchema, type PlannerOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";
import type { Turn } from "../session/store.ts";

const SYSTEM = `Ты — планировщик аналитической системы Meridian (B2B-маркетплейс).
Классифицируй вопрос руководителя:
- "bi": вопрос, отвечаемый ОДНИМ срезом данных (одна метрика/таблица, даже с разбивкой по годам/сегментам/категориям и динамикой). По умолчанию выбирай bi. sub_questions=[исходный вопрос целиком, БЕЗ дробления].
- "research": если вопрос требует НЕСКОЛЬКИХ независимых срезов данных. Тогда 2-4 под-вопроса, каждый — самостоятельный осмысленный запрос.
- "insufficient": ответ невозможен по доступным данным (прогноз будущего; нужных полей/таблиц нет в витрине).
КОНТЕКСТ ДИАЛОГА: если он дан и текущий вопрос — уточнение (ссылается на предыдущий: «а по сегментам?», «в динамике»), РАЗРЕШИ ссылку: сформируй sub_questions как САМОДОСТАТОЧНЫЕ вопросы с подставленной темой из контекста.
Не дроби единый запрос на искусственные части. Данные охватывают 2023-01..2025-12.
Верни JSON: {mode, reasoning, sub_questions[]}.`;

export async function plan(
  llm: LLMClient,
  question: string,
  opts?: { context?: Turn[]; preferResearch?: boolean },
): Promise<PlannerOutput> {
  const ctx = opts?.context?.length
    ? "Контекст диалога (старые пары вопрос→ответ):\n" +
      opts.context.map((t) => `- В: ${t.question}\n  О: ${t.answer.slice(0, 300)}`).join("\n") + "\n\n"
    : "";
  const hint = opts?.preferResearch
    ? "Подсказка: пользователь ждёт ИССЛЕДОВАНИЕ — предпочитай mode=research с декомпозицией, если вопрос это допускает.\n"
    : "";
  return callJSON(llm, SYSTEM, `${ctx}${hint}Текущий вопрос: ${question}`, PlannerOutputSchema);
}
```

- [ ] **Step 4: Тест планнера проходит.** Run: `node --import tsx --test src/agents/planner.test.ts` → PASS.

- [ ] **Step 5: Падающий тест оркестратора (plan/sub_answers в ответе)**

Добавить в `src/orchestrator.test.ts`:
```ts
test("ответ содержит plan и sub_answers; передаёт context/preferResearch в plan", async () => {
  let seenOpts: unknown;
  const r = await runPipeline(agents({
    plan: async (_q, opts) => { seenOpts = opts; return { mode: "research", reasoning: "", sub_questions: ["A", "B"] }; },
  }), { message: "сложный" }, { context: [{ question: "q", answer: "a" }], preferResearch: true });
  assert.equal(r.plan?.mode, "research");
  assert.equal(r.plan?.sub_questions.length, 2);
  assert.equal(r.sub_answers?.length, 2);
  assert.deepEqual((seenOpts as { preferResearch?: boolean }).preferResearch, true);
});
```

- [ ] **Step 6: Запустить — падает.** Run: `node --import tsx --test src/orchestrator.test.ts` → FAIL.

- [ ] **Step 7: Обновить `src/orchestrator.ts`**

Изменить тип `Agents.plan` (строка с `plan:`):
```ts
  plan: (q: string, opts?: { context?: Turn[]; preferResearch?: boolean }) => Promise<PlannerOutput>;
```
Добавить импорт `Turn` вверху:
```ts
import type { Turn } from "./session/store.ts";
```
Изменить сигнатуру и тело `runPipeline`:
```ts
export async function runPipeline(
  a: Agents,
  query: UserQuery,
  runOpts?: { context?: Turn[]; preferResearch?: boolean },
): Promise<FinalResponse> {
  const trace: TraceEntry[] = [];
  const session_id = query.session_id ?? `s-${randomUUID()}`;
  const planned = await a.plan(query.message, runOpts);
  trace.push({ agent: "planner", note: planned.mode });
  const planSummary = { mode: planned.mode, sub_questions: planned.sub_questions };

  if (planned.mode === "insufficient") {
    return {
      response: `Недостаточно данных для ответа: ${planned.reasoning}`,
      assumptions: [], trace, chart: null, insufficient_data: true, session_id,
      plan: planSummary, sub_answers: [],
    };
  }

  if (planned.sub_questions.length === 0) {
    return {
      response: `Недостаточно данных для надёжного ответа: план не содержит под-вопросов.`,
      assumptions: [], trace, chart: null, insufficient_data: true, session_id,
      plan: planSummary, sub_answers: [],
    };
  }

  const results = [];
  for (const sub of planned.sub_questions) {
    results.push(await answerOne(a, sub, trace));
  }

  const ok = results.filter((r) => !r.rejected && r.ext.data_sufficient);
  const insufficient = ok.length === 0;
  const used = ok.length > 0 ? ok : results;
  const primary = used[used.length - 1];
  const answer = used.length > 1
    ? used.map((r, i) => `${i + 1}. ${r.ana.answer}`).join("\n")
    : primary.ana.answer;

  const viz = insufficient ? { chart: null, rationale: "" } : await a.visualize(primary.ana, primary.ext);
  if (viz.chart) trace.push({ agent: "visualizer", note: viz.chart.type });

  const assumptions = [...new Set(results.flatMap((r) => [...r.ana.assumptions, ...r.ext.assumptions]))];
  return {
    response: insufficient ? `Недостаточно данных для надёжного ответа. ${answer}` : answer,
    assumptions, trace, chart: viz.chart, insufficient_data: insufficient, session_id,
    plan: planSummary, sub_answers: used.map((r) => r.ana.answer),
  };
}
```

- [ ] **Step 8: Обновить `src/wiring.ts`** — пробросить opts в plan:
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
    plan: (q, opts) => plan(llm, q, opts),
    extract: (q) => extract(llm, q),
    analyze: (q, ext) => analyze(llm, q, ext),
    critique: (q, ext, ana) => critique(llm, q, ext, ana),
    visualize: (ana, ext) => visualize(llm, ana, ext),
  };
}
```

- [ ] **Step 9: Все тесты + typecheck.** Run: `npm test` → все PASS (старые тесты планнера/оркестратора совместимы: opts опционален). `npm run typecheck` → ок.

- [ ] **Step 10: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/agents/planner.ts src/agents/planner.test.ts src/orchestrator.ts src/orchestrator.test.ts src/wiring.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 5: контекст диалога в Planner + plan/sub_answers в ответе"
```

---

## Task 4: Пресеты и сборка отчёта

**Files:** Create `src/presets.ts`, `src/report.ts`, `src/report.test.ts`

- [ ] **Step 1: Падающий тест**

Create `src/report.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "./presets.ts";
import { compileReport } from "./report.ts";

test("есть пресет-вопросы здоровья", () => {
  assert.ok(PRESETS.length >= 5);
  assert.ok(PRESETS.every((p) => typeof p.question === "string"));
});

test("compileReport прогоняет пресеты через переданный pipeline", async () => {
  const fakePipeline = async (q: { message: string }) => ({
    response: "ответ на " + q.message, assumptions: [], trace: [], chart: null,
    insufficient_data: false, session_id: "s",
  });
  const rep = await compileReport(fakePipeline, "2026-06-11T09:00:00Z");
  assert.equal(rep.items.length, PRESETS.length);
  assert.equal(rep.generatedAt, "2026-06-11T09:00:00Z");
  assert.match(rep.items[0].response, /ответ на/);
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/report.test.ts` → FAIL.

- [ ] **Step 3: Реализация.** Create `src/presets.ts`:
```ts
export type Preset = { title: string; question: string; alert?: boolean };

export const PRESETS: Preset[] = [
  { title: "Выручка и динамика", question: "Какая чистая выручка по годам и как она менялась год-к-году?", alert: true },
  { title: "Структура GMV", question: "Как распределён GMV по продуктовым линиям?" },
  { title: "Отток и причины", question: "Каковы топ-причины оттока клиентов?", alert: true },
  { title: "Угроза AI-конкурентов", question: "Сколько клиентов ушло из-за AI-альтернатив?", alert: true },
  { title: "Юнит-экономика", question: "Какое отношение LTV/CAC по сегментам? Где привлечение убыточно?", alert: true },
  { title: "NPS по линиям", question: "Какой NPS по продуктовым линиям? Где он самый низкий?" },
  { title: "Вовлечённость", question: "Как выглядит вовлечённость клиентов по статусам активности?" },
];
```

Create `src/report.ts`:
```ts
import type { FinalResponse, UserQuery } from "./contracts/types.ts";
import { PRESETS } from "./presets.ts";

export type ReportItem = {
  title: string;
  question: string;
  response: string;
  chart: FinalResponse["chart"];
  insufficient_data: boolean;
  alert: boolean;
};
export type Report = { generatedAt: string; items: ReportItem[] };

export async function compileReport(
  pipeline: (q: UserQuery) => Promise<FinalResponse>,
  generatedAt: string,
): Promise<Report> {
  const items: ReportItem[] = [];
  for (const p of PRESETS) {
    const r = await pipeline({ message: p.question });
    items.push({
      title: p.title, question: p.question, response: r.response,
      chart: r.chart, insufficient_data: r.insufficient_data, alert: p.alert ?? false,
    });
  }
  return { generatedAt, items };
}
```

- [ ] **Step 4: Тест проходит.** Run: `node --import tsx --test src/report.test.ts` → PASS. `npm run typecheck` → ок.

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/presets.ts src/report.ts src/report.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 5: пресеты здоровья + сборка отчёта"
```

---

## Task 5: Доставка — инбокс + опц. webhook/Telegram

**Files:** Create `src/delivery.ts`, `src/delivery.test.ts`

- [ ] **Step 1: Падающий тест**

Create `src/delivery.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Inbox, deliver } from "./delivery.ts";
import type { Report } from "./report.ts";

const rep: Report = { generatedAt: "2026-06-11T09:00:00Z", items: [
  { title: "T", question: "q", response: "r", chart: null, insufficient_data: false, alert: false },
] };

test("deliver кладёт отчёт в инбокс", async () => {
  const inbox = new Inbox();
  await deliver(rep, { inbox });
  assert.equal(inbox.list().length, 1);
  assert.equal(inbox.list()[0].generatedAt, rep.generatedAt);
});

test("deliver вызывает webhook, если задан url (через инъекцию fetch)", async () => {
  const inbox = new Inbox();
  let called = "";
  const fakeFetch = async (url: string) => { called = url; return { ok: true } as Response; };
  await deliver(rep, { inbox, webhookUrl: "https://hook.example/x", fetchFn: fakeFetch as typeof fetch });
  assert.equal(called, "https://hook.example/x");
});
```

- [ ] **Step 2: Запустить — падает.** Run: `node --import tsx --test src/delivery.test.ts` → FAIL.

- [ ] **Step 3: Реализация.** Create `src/delivery.ts`:
```ts
import type { Report } from "./report.ts";

export class Inbox {
  private items: Report[] = [];
  add(r: Report): void { this.items.unshift(r); }
  list(): Report[] { return this.items; }
}

function reportToText(r: Report): string {
  const head = `📊 Дашборд здоровья Meridian — ${r.generatedAt}`;
  const body = r.items.map((i) => `• ${i.title}: ${i.response.slice(0, 200)}`).join("\n");
  return `${head}\n${body}`;
}

export type DeliverOpts = {
  inbox: Inbox;
  webhookUrl?: string;
  telegram?: { token: string; chatId: string };
  fetchFn?: typeof fetch;
};

export async function deliver(report: Report, opts: DeliverOpts): Promise<void> {
  opts.inbox.add(report);
  const doFetch = opts.fetchFn ?? fetch;
  if (opts.webhookUrl) {
    try {
      await doFetch(opts.webhookUrl, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report),
      });
    } catch { /* доставка не критична — отчёт уже в инбоксе */ }
  }
  if (opts.telegram) {
    try {
      const url = `https://api.telegram.org/bot${opts.telegram.token}/sendMessage`;
      await doFetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: opts.telegram.chatId, text: reportToText(report) }),
      });
    } catch { /* не критично */ }
  }
}
```

- [ ] **Step 4: Тест проходит.** Run: `node --import tsx --test src/delivery.test.ts` → PASS (2). `npm run typecheck` → ок.

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/delivery.ts src/delivery.test.ts
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 5: доставка отчётов (инбокс + webhook + опц. Telegram)"
```

---

## Task 6: Планировщик (node-cron)

**Files:** Create `src/scheduler.ts`, `src/scheduler.test.ts`; Modify `package.json`

- [ ] **Step 1: Установить node-cron**

Run: `cd /Users/irinafrolova/Documents/sh26 && npm install node-cron && npm install -D @types/node-cron`
Expected: добавлено в package.json, без ошибок сборки (чистый JS).

- [ ] **Step 2: Падающий тест (job-фабрика, без реального крона)**

Create `src/scheduler.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createReportJob } from "./scheduler.ts";
import { Inbox } from "./delivery.ts";

test("job собирает отчёт и доставляет в инбокс", async () => {
  const inbox = new Inbox();
  const fakePipeline = async (q: { message: string }) => ({
    response: "ок " + q.message, assumptions: [], trace: [], chart: null,
    insufficient_data: false, session_id: "s",
  });
  const job = createReportJob(fakePipeline, { inbox }, () => "2026-06-11T09:00:00Z");
  await job();
  assert.equal(inbox.list().length, 1);
  assert.ok(inbox.list()[0].items.length >= 5);
});
```

- [ ] **Step 3: Запустить — падает.** Run: `node --import tsx --test src/scheduler.test.ts` → FAIL.

- [ ] **Step 4: Реализация.** Create `src/scheduler.ts`:
```ts
import cron from "node-cron";
import type { FinalResponse, UserQuery } from "./contracts/types.ts";
import { compileReport } from "./report.ts";
import { deliver, type DeliverOpts } from "./delivery.ts";

type Pipeline = (q: UserQuery) => Promise<FinalResponse>;

// Возвращает async-задачу: собрать отчёт сейчас и доставить. Тестируется напрямую.
export function createReportJob(
  pipeline: Pipeline,
  deliverOpts: DeliverOpts,
  now: () => string = () => new Date().toISOString(),
): () => Promise<void> {
  return async () => {
    const report = await compileReport(pipeline, now());
    await deliver(report, deliverOpts);
  };
}

// Запускает крон по выражению; возвращает функцию остановки. Тонкая обёртка (не юнит-тестируется).
export function startScheduler(cronExpr: string, job: () => Promise<void>): () => void {
  const task = cron.schedule(cronExpr, () => { void job(); });
  return () => task.stop();
}
```

- [ ] **Step 5: Тест проходит.** Run: `node --import tsx --test src/scheduler.test.ts` → PASS. `npm run typecheck` → ок.

- [ ] **Step 6: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/scheduler.ts src/scheduler.test.ts package.json package-lock.json
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 5: планировщик отчётов (node-cron) + job-фабрика"
```

---

## Task 7: Сервер — статика, новые эндпоинты, проброс контекста, сборка main

**Files:** Modify `src/server.ts`, `src/server.test.ts`, `src/main.ts`; Create `web/index.html` (заглушка для статики, полноценный — Task 8)

- [ ] **Step 1: Заглушка статики, чтобы тест статики имел что отдавать**

Create `web/index.html` (минимальная заглушка; финальный SPA — Task 8):
```html
<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Meridian</title></head><body><div id="app">Meridian</div></body></html>
```

- [ ] **Step 2: Падающие тесты сервера**

Заменить содержимое `src/server.test.ts` целиком:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer, type ServerDeps } from "./server.ts";
import type { FinalResponse } from "./contracts/types.ts";
import { Inbox } from "./delivery.ts";
import type { Report } from "./report.ts";

const ok: FinalResponse = {
  response: "ответ", assumptions: [], trace: [], chart: null,
  insufficient_data: false, session_id: "s1",
};
function deps(over: Partial<ServerDeps> = {}): ServerDeps {
  return {
    pipeline: async () => ok,
    inbox: new Inbox(),
    compileNow: async (): Promise<Report> => ({ generatedAt: "t", items: [] }),
    presets: [{ title: "T", question: "q" }],
    ...over,
  };
}
const app = () => buildServer(deps());

test("POST /api/chat валидный → 200 + response", async () => {
  const r = await app().inject({ method: "POST", url: "/api/chat", payload: { message: "q" } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().response, "ответ");
});

test("пустое тело → 400", async () => {
  const r = await app().inject({ method: "POST", url: "/api/chat", payload: "", headers: { "content-type": "application/json" } });
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

test("ошибка пайплайна → НЕ 500, insufficient", async () => {
  const bad = buildServer(deps({ pipeline: async () => { throw new Error("boom"); } }));
  const r = await bad.inject({ method: "POST", url: "/api/chat", payload: { message: "q" } });
  assert.notEqual(r.statusCode, 500);
  assert.equal(r.json().insufficient_data, true);
});

test("GET / отдаёт HTML", async () => {
  const r = await app().inject({ method: "GET", url: "/" });
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["content-type"] as string, /html/);
});

test("GET /api/presets → список", async () => {
  const r = await app().inject({ method: "GET", url: "/api/presets" });
  assert.equal(r.statusCode, 200);
  assert.ok(Array.isArray(r.json()));
});

test("POST /api/report → собирает и кладёт в инбокс", async () => {
  const d = deps();
  const r = await buildServer(d).inject({ method: "POST", url: "/api/report" });
  assert.equal(r.statusCode, 200);
  assert.equal(d.inbox.list().length, 1);
});

test("GET /api/reports → лента", async () => {
  const d = deps();
  await buildServer(d).inject({ method: "POST", url: "/api/report" });
  const r = await buildServer(d).inject({ method: "GET", url: "/api/reports" });
  assert.equal(r.statusCode, 200);
});

test("prefer_research пробрасывается в pipeline", async () => {
  let seen: unknown;
  const d = deps({ pipeline: async (q) => { seen = q; return ok; } });
  await buildServer(d).inject({ method: "POST", url: "/api/chat", payload: { message: "q", prefer_research: true } });
  assert.equal((seen as { prefer_research?: boolean }).prefer_research, true);
});
```

- [ ] **Step 3: Запустить — падает.** Run: `node --import tsx --test src/server.test.ts` → FAIL.

- [ ] **Step 4: Реализация `src/server.ts`**

Заменить содержимое целиком:
```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import type { FinalResponse, UserQuery } from "./contracts/types.ts";
import type { Inbox } from "./delivery.ts";
import type { Report } from "./report.ts";
import type { Preset } from "./presets.ts";

export type PipelineFn = (q: UserQuery) => Promise<FinalResponse>;
export type ServerDeps = {
  pipeline: PipelineFn;
  inbox: Inbox;
  compileNow: () => Promise<Report>;
  presets: Pick<Preset, "title" | "question">[];
};

const PATHS = ["/api/chat", "/api/v1/chat", "/chat", "/api/ask", "/api/query"];
const WEB = resolve(process.cwd(), "web");
function readWeb(name: string): string { return readFileSync(resolve(WEB, name), "utf8"); }

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

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler((_err, _req, reply) => reply.code(400).send({ error: "ошибка запроса" }));
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "путь не найден" }));

  app.get("/health", async () => ({ status: "ok" }));

  // Статика SPA
  const serve = (name: string, type: string) => async (_req: unknown, reply: { type: (t: string) => { send: (b: string) => unknown } }) =>
    reply.type(type).send(readWeb(name));
  app.get("/", serve("index.html", "text/html; charset=utf-8") as never);
  app.get("/app.js", serve("app.js", "application/javascript; charset=utf-8") as never);
  app.get("/styles.css", serve("styles.css", "text/css; charset=utf-8") as never);

  // Пресеты и отчёты
  app.get("/api/presets", async () => deps.presets);
  app.post("/api/report", async (_req, reply) => {
    const rep = await deps.compileNow();
    return reply.code(200).send(rep);
  });
  app.get("/api/reports", async () => deps.inbox.list());

  // Чат
  const handler = async (req: { body: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const body = req.body;
    if (body === undefined || body === null || body === "") {
      return reply.code(400).send({ error: "пустое тело" });
    }
    const message = extractMessage(body);
    if (message === null || message.trim() === "") {
      return reply.code(422).send({ error: "отсутствует поле вопроса (message/query/messages)" });
    }
    const b = body as Record<string, unknown>;
    const session_id = typeof b.session_id === "string" ? b.session_id : undefined;
    const prefer_research = b.prefer_research === true;
    try {
      const res = await deps.pipeline({ message, session_id, prefer_research });
      return reply.code(200).send(res);
    } catch {
      return reply.code(200).send({
        response: "Произошла внутренняя ошибка при обработке запроса.",
        assumptions: [], trace: [], chart: null, insufficient_data: true,
        session_id: session_id ?? "s-error",
      } satisfies FinalResponse);
    }
  };
  for (const p of PATHS) app.post(p, handler as never);
  return app;
}
```

- [ ] **Step 5: Тесты сервера проходят.** Run: `node --import tsx --test src/server.test.ts` → PASS (11). `npm run typecheck` → ок.

- [ ] **Step 6: Обновить `src/main.ts`** (контекст сессий + scheduler):
```ts
import { buildServer } from "./server.ts";
import { buildAgents } from "./wiring.ts";
import { runPipeline } from "./orchestrator.ts";
import { createLLMClient } from "./llm/client.ts";
import { SessionStore } from "./session/store.ts";
import { Inbox, deliver } from "./delivery.ts";
import { compileReport } from "./report.ts";
import { PRESETS } from "./presets.ts";
import { createReportJob, startScheduler } from "./scheduler.ts";
import type { UserQuery } from "./contracts/types.ts";

const agents = buildAgents(createLLMClient());
const sessions = new SessionStore(5);
const inbox = new Inbox();

const pipeline = async (q: UserQuery & { prefer_research?: boolean }) => {
  const context = q.session_id ? sessions.get(q.session_id) : [];
  const res = await runPipeline(agents, q, { context, preferResearch: q.prefer_research });
  if (res.session_id) sessions.append(res.session_id, q.message, res.response);
  return res;
};

const inbox2 = inbox;
const deliverOpts = {
  inbox: inbox2,
  webhookUrl: process.env.REPORT_WEBHOOK,
  telegram: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    ? { token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }
    : undefined,
};
const compileNow = () => compileReport(pipeline, new Date().toISOString());

const app = buildServer({ pipeline, inbox, compileNow, presets: PRESETS });

const cronExpr = process.env.SCHEDULE_CRON ?? "0 9 * * 1"; // пн 9:00
startScheduler(cronExpr, createReportJob(pipeline, deliverOpts));

const port = Number(process.env.PORT ?? 8000);
app.listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`Meridian on :${port} (schedule: ${cronExpr})`))
  .catch((e) => { console.error(e); process.exit(1); });
```
Примечание: `new Date().toISOString()` в рантайме допустим (это не workflow-скрипт). Дубликат `inbox2` убрать — использовать `inbox` напрямую в deliverOpts.

- [ ] **Step 7: Полный прогон + typecheck.** Run: `npm test` (все зелёные); `npm run typecheck` → ок.

- [ ] **Step 8: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add src/server.ts src/server.test.ts src/main.ts web/index.html
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 5: сервер — статика, /api/report,/api/reports,/api/presets, контекст, scheduler"
```

---

## Task 8: SPA — Gravity UI, три режима, Chart.js

**Files:** Create/replace `web/index.html`, `web/app.js`, `web/styles.css`

Это UI-задача (не TDD). Проверка — ручная (Task 9) + серверный тест «GET / отдаёт HTML» из Task 7. Создать три файла полностью.

- [ ] **Step 1: `web/styles.css`** — токены Gravity UI + вёрстка:
```css
:root {
  --g-color-base-background: #ffffff;
  --g-color-base-generic: #f0f1f2;
  --g-color-line-generic: #e0e1e3;
  --g-color-text-primary: #1f2226;
  --g-color-text-secondary: #6c6f76;
  --g-color-brand: #5d56c4;
  --g-color-brand-hover: #4a44a8;
  --g-color-danger: #e53e3e;
  --g-color-warning-bg: #fff4e0;
  --radius: 8px;
  --font: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font); color: var(--g-color-text-primary); background: var(--g-color-base-generic); }
header { background: var(--g-color-base-background); border-bottom: 1px solid var(--g-color-line-generic); padding: 14px 20px; display: flex; align-items: center; gap: 16px; }
header h1 { font-size: 18px; margin: 0; }
header .sub { color: var(--g-color-text-secondary); font-size: 13px; }
.tabs { display: flex; gap: 4px; padding: 0 20px; background: var(--g-color-base-background); border-bottom: 1px solid var(--g-color-line-generic); }
.tab { padding: 12px 16px; cursor: pointer; border: none; background: none; font-size: 14px; color: var(--g-color-text-secondary); border-bottom: 2px solid transparent; }
.tab.active { color: var(--g-color-brand); border-bottom-color: var(--g-color-brand); font-weight: 600; }
main { max-width: 920px; margin: 0 auto; padding: 20px; }
.hidden { display: none; }
.bubble { background: var(--g-color-base-background); border: 1px solid var(--g-color-line-generic); border-radius: var(--radius); padding: 12px 14px; margin: 8px 0; }
.bubble.user { background: var(--g-color-brand); color: #fff; margin-left: 20%; }
.bubble.bot { margin-right: 10%; }
.meta { font-size: 12px; color: var(--g-color-text-secondary); margin-top: 8px; }
details summary { cursor: pointer; font-size: 12px; color: var(--g-color-text-secondary); }
.insufficient { background: var(--g-color-warning-bg); border-color: #f0c674; }
.row { display: flex; gap: 8px; margin-top: 12px; }
input, button { font-family: var(--font); font-size: 14px; }
input[type=text] { flex: 1; padding: 10px 12px; border: 1px solid var(--g-color-line-generic); border-radius: var(--radius); }
button.primary { background: var(--g-color-brand); color: #fff; border: none; border-radius: var(--radius); padding: 10px 16px; cursor: pointer; }
button.primary:hover { background: var(--g-color-brand-hover); }
.cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.card { background: var(--g-color-base-background); border: 1px solid var(--g-color-line-generic); border-radius: var(--radius); padding: 14px; }
.card.alert { border-left: 3px solid var(--g-color-danger); }
.card h3 { margin: 0 0 8px; font-size: 14px; }
.card .val { font-size: 13px; color: var(--g-color-text-secondary); }
canvas { max-width: 100%; margin-top: 8px; }
.loader { color: var(--g-color-text-secondary); font-size: 13px; }
.subq { font-size: 13px; border-left: 2px solid var(--g-color-brand); padding-left: 10px; margin: 6px 0; }
```

- [ ] **Step 2: `web/index.html`** (заменить заглушку):
```html
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Meridian — AI-аналитик</title>
  <link rel="stylesheet" href="/styles.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body>
  <header>
    <h1>Meridian</h1>
    <span class="sub">AI-аналитик для совета директоров</span>
  </header>
  <nav class="tabs">
    <button class="tab active" data-tab="chat">Диалоговый BI</button>
    <button class="tab" data-tab="research">Ad-hoc исследование</button>
    <button class="tab" data-tab="reports">Отчёты по расписанию</button>
  </nav>
  <main>
    <section id="chat" class="pane">
      <div id="chat-log"></div>
      <div class="row">
        <input id="chat-input" type="text" placeholder="Спросите про выручку, отток, юнит-экономику…" />
        <button class="primary" id="chat-send">Спросить</button>
      </div>
    </section>
    <section id="research" class="pane hidden">
      <div id="research-log"></div>
      <div class="row">
        <input id="research-input" type="text" placeholder="Сложный вопрос с гипотезой — система проведёт мини-исследование…" />
        <button class="primary" id="research-send">Исследовать</button>
      </div>
    </section>
    <section id="reports" class="pane hidden">
      <div class="row">
        <button class="primary" id="report-now">Собрать отчёт сейчас</button>
        <span class="sub" style="align-self:center">Расписание: каждый пн 9:00 — авто-сборка и отправка</span>
      </div>
      <div id="reports-out"></div>
    </section>
  </main>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: `web/app.js`** — логика трёх режимов:
```js
const sessionId = "web-" + Math.random().toString(36).slice(2);
let chartSeq = 0;

async function ask(message, preferResearch) {
  const res = await fetch("/api/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId, prefer_research: !!preferResearch }),
  });
  return res.json();
}

function renderChart(parent, chart) {
  if (!chart || !chart.data || !chart.data.length) return;
  const canvas = document.createElement("canvas");
  canvas.id = "c" + chartSeq++;
  parent.appendChild(canvas);
  const x = chart.x, y = Array.isArray(chart.y) ? chart.y[0] : chart.y;
  const labels = chart.data.map((r) => String(r[x]));
  const values = chart.data.map((r) => Number(r[y]));
  const type = ["line", "bar", "pie", "scatter"].includes(chart.type) ? chart.type : "bar";
  new Chart(canvas, {
    type, data: { labels, datasets: [{ label: chart.title || y, data: values, backgroundColor: "#5d56c4" }] },
    options: { plugins: { legend: { display: type === "pie" } }, responsive: true },
  });
}

function botBubble(parent, r) {
  const b = document.createElement("div");
  b.className = "bubble bot" + (r.insufficient_data ? " insufficient" : "");
  b.innerHTML = `<div>${escapeHtml(r.response).replace(/\n/g, "<br>")}</div>`;
  renderChart(b, r.chart);
  if (r.assumptions && r.assumptions.length) {
    const d = document.createElement("details");
    d.innerHTML = `<summary>Допущения (${r.assumptions.length})</summary>` +
      r.assumptions.map((a) => `<div class="meta">• ${escapeHtml(a)}</div>`).join("");
    b.appendChild(d);
  }
  if (r.trace && r.trace.length) {
    const d = document.createElement("details");
    d.innerHTML = `<summary>Трасса агентов</summary><div class="meta">` +
      r.trace.map((t) => t.agent + (t.verdict ? "(" + t.verdict + ")" : "")).join(" → ") + `</div>`;
    b.appendChild(d);
  }
  parent.appendChild(b);
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

function userBubble(parent, text) {
  const b = document.createElement("div"); b.className = "bubble user"; b.textContent = text; parent.appendChild(b);
}
function loader(parent) {
  const l = document.createElement("div"); l.className = "loader"; l.textContent = "Думаю…"; parent.appendChild(l); return l;
}

// Вкладка: Диалог
document.getElementById("chat-send").onclick = async () => {
  const inp = document.getElementById("chat-input"); const log = document.getElementById("chat-log");
  const q = inp.value.trim(); if (!q) return; inp.value = "";
  userBubble(log, q); const l = loader(log);
  try { const r = await ask(q, false); l.remove(); botBubble(log, r); }
  catch { l.textContent = "Ошибка запроса"; }
};

// Вкладка: Исследование (показывает декомпозицию)
document.getElementById("research-send").onclick = async () => {
  const inp = document.getElementById("research-input"); const log = document.getElementById("research-log");
  const q = inp.value.trim(); if (!q) return; inp.value = "";
  userBubble(log, q); const l = loader(log);
  try {
    const r = await ask(q, true); l.remove();
    if (r.plan && r.plan.sub_questions.length > 1) {
      const d = document.createElement("div"); d.className = "bubble bot";
      d.innerHTML = "<b>Декомпозиция исследования:</b>" +
        r.plan.sub_questions.map((s, i) => `<div class="subq">${i + 1}. ${escapeHtml(s)}</div>`).join("");
      log.appendChild(d);
    }
    botBubble(log, r);
  } catch { l.textContent = "Ошибка запроса"; }
};

// Вкладка: Отчёты
document.getElementById("report-now").onclick = async () => {
  const out = document.getElementById("reports-out"); out.innerHTML = '<div class="loader">Собираю дашборд здоровья…</div>';
  try {
    const res = await fetch("/api/report", { method: "POST" }); const rep = await res.json();
    renderReport(out, rep);
  } catch { out.innerHTML = "Ошибка сборки отчёта"; }
};

function renderReport(out, rep) {
  out.innerHTML = `<h3>Дашборд здоровья — ${new Date(rep.generatedAt).toLocaleString("ru")}</h3>`;
  const grid = document.createElement("div"); grid.className = "cards";
  for (const it of rep.items) {
    const c = document.createElement("div"); c.className = "card" + (it.alert ? " alert" : "");
    c.innerHTML = `<h3>${escapeHtml(it.title)}</h3><div class="val">${escapeHtml(it.response).slice(0, 220)}</div>`;
    renderChart(c, it.chart);
    grid.appendChild(c);
  }
  out.appendChild(grid);
}

// Переключение вкладок
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".pane").forEach((p) => p.classList.add("hidden"));
    t.classList.add("active");
    document.getElementById(t.dataset.tab).classList.remove("hidden");
  };
});
```

- [ ] **Step 4: Серверный тест статики уже покрывает GET /** (Task 7). Дополнительно вручную: `npm test` зелёный, `npm run typecheck` ок.

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add web/
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 5: SPA на токенах Gravity UI — 3 режима + Chart.js"
```

---

## Task 9: Финальная проверка (тесты + живой смоук) + README

**Files:** Modify `README.md`, `.env.example`

- [ ] **Step 1: Полный прогон**
```bash
cd /Users/irinafrolova/Documents/sh26
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npm run typecheck
```
Expected: все тесты зелёные, typecheck без ошибок.

- [ ] **Step 2: Живой смоук (нужен .env с ключом Yandex)**
```bash
cd /Users/irinafrolova/Documents/sh26
SCHEDULE_CRON="*/2 * * * *" node --env-file=.env --import tsx src/main.ts &
sleep 3
curl -s localhost:8000/ | grep -o "Meridian" | head -1
curl -s localhost:8000/api/presets | head -c 120
curl -s -XPOST localhost:8000/api/chat -H 'content-type: application/json' -d '{"message":"выручка по продуктовым линиям","session_id":"smoke"}' | head -c 200
curl -s -XPOST localhost:8000/api/chat -H 'content-type: application/json' -d '{"message":"а по сегментам LTV/CAC?","session_id":"smoke","prefer_research":true}' | head -c 200
lsof -ti:8000 | xargs kill
```
Expected: `/` отдаёт HTML с «Meridian»; `/api/presets` — массив; чат отвечает; второй (уточняющий) запрос с тем же session_id работает.

- [ ] **Step 3: Дополнить `.env.example`** — добавить строки расписания/доставки:
```
# Отчёты по расписанию (этап 5)
SCHEDULE_CRON=0 9 * * 1
# опциональная доставка:
# REPORT_WEBHOOK=https://example/hook
# TELEGRAM_BOT_TOKEN=...
# TELEGRAM_CHAT_ID=...
```

- [ ] **Step 4: Дополнить `README.md`** — раздел «Веб-интерфейс (этап 5)»:
```markdown
## Веб-интерфейс (этап 5)
После `npm start` открыть http://localhost:8000 — три режима:
- **Диалоговый BI** — чат с удержанием контекста.
- **Ad-hoc исследование** — сложный вопрос → декомпозиция + мини-исследование.
- **Отчёты по расписанию** — авто-сборка дашборда здоровья (cron `SCHEDULE_CRON`, по умолчанию пн 9:00) + кнопка «Собрать сейчас». Доставка: инбокс + опц. webhook/Telegram (см. .env.example).
```

- [ ] **Step 5: Коммит**
```bash
cd /Users/irinafrolova/Documents/sh26
git add README.md .env.example
git -c user.name='AI South Hub' -c user.email='crazywoolfin@gmail.com' commit -m "Этап 5: README + .env.example (расписание/доставка) + финальная проверка"
```

---

## Self-review (выполнено автором плана)

- **Покрытие спеки:** контракт (plan/sub_answers/prefer_research)→T1; SessionStore→T2; planner-контекст+оркестратор→T3; presets+report→T4; delivery (инбокс/webhook/Telegram)→T5; scheduler node-cron→T6; server статика+эндпоинты+main+контекст+scheduler→T7; SPA Gravity UI 3 режима+Chart.js→T8; верификация+README→T9. Все секции спеки покрыты.
- **Плейсхолдеров нет:** полный код во всех шагах.
- **Согласованность:** `ServerDeps`, `Inbox`, `Report`, `compileReport(pipeline, generatedAt)`, `deliver(report, opts)`, `createReportJob(pipeline, deliverOpts, now)`, `plan(llm, q, {context, preferResearch})`, `runPipeline(a, query, runOpts)` — сигнатуры едины между задачами и тестами. Только Planner потребляет контекст (Extractor/Analyst/Critic/Viz без изменений). Поле `prefer_research` в запросе → `preferResearch` в runOpts.
- **Совместимость:** старые тесты планнера/оркестратора/сервера обновлены там, где менялись сигнатуры (T3 добавляет тесты; T7 заменяет server.test целиком). `node-cron` — чистый JS.
- **Не-TDD части:** SPA (T8) — ручная проверка + серверный тест «GET / → HTML».
