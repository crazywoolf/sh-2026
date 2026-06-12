import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer, type ServerDeps } from "./server.ts";
import type { FinalResponse } from "./contracts/types.ts";
import { Inbox } from "./delivery.ts";
import type { Report } from "./report.ts";
import { MonitorStore } from "./monitor/store.ts";
import { ScheduleStore } from "./schedules/store.ts";

const ok: FinalResponse = {
  response: "ответ", assumptions: [], trace: [], chart: null,
  insufficient_data: false, session_id: "s1",
};
function deps(over: Partial<ServerDeps> = {}): ServerDeps {
  const inbox = new Inbox();
  return {
    pipeline: async () => ok,
    inbox,
    compileNow: async (): Promise<Report> => ({ generatedAt: "t", items: [] }),
    deliver: async (r: Report) => { inbox.add(r); },
    presets: [{ title: "T", question: "q" }],
    monitor: new MonitorStore(),
    schedules: new ScheduleStore({ seed: [{ id: "s1", name: "Дашборд", cron: "0 9 * * 1", enabled: true }] }),
    reconcileSchedules: () => {},
    ...over,
  };
}
const app = () => buildServer(deps());

test("POST /api/chat валидный → 200 + response", async () => {
  const r = await app().inject({ method: "POST", url: "/api/chat", payload: { message: "q" } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().response, "ответ");
});

test("монитор: запрос логируется и виден в /api/monitor/log", async () => {
  const d = deps();
  const a = buildServer(d);
  await a.inject({ method: "POST", url: "/api/chat", payload: { message: "сколько клиентов?", session_id: "tester1" } });
  const r = await a.inject({ method: "GET", url: "/api/monitor/log" });
  assert.equal(r.statusCode, 200);
  const log = r.json();
  assert.equal(log[0].message, "сколько клиентов?");
  assert.equal(log[0].session_id, "tester1");
  assert.equal(log[0].status, 200);
});

test("расписания: GET список, POST создаёт + reconcile", async () => {
  let reconciled = 0;
  const d = deps({ reconcileSchedules: () => { reconciled++; } });
  const a = buildServer(d);
  const list0 = await a.inject({ method: "GET", url: "/api/schedules" });
  assert.equal(list0.json().length, 1);
  const created = await a.inject({ method: "POST", url: "/api/schedules", payload: { name: "Демо", cron: "*/5 * * * *" } });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().name, "Демо");
  assert.equal(reconciled, 1);
  assert.equal((await a.inject({ method: "GET", url: "/api/schedules" })).json().length, 2);
});

test("расписания: PATCH toggle, DELETE", async () => {
  const d = deps();
  const a = buildServer(d);
  const p = await a.inject({ method: "PATCH", url: "/api/schedules/s1", payload: { enabled: false } });
  assert.equal(p.json().enabled, false);
  const del = await a.inject({ method: "DELETE", url: "/api/schedules/s1" });
  assert.equal(del.statusCode, 200);
  assert.equal((await a.inject({ method: "GET", url: "/api/schedules" })).json().length, 0);
});

test("монитор: 404-проба тоже логируется", async () => {
  const d = deps();
  const a = buildServer(d);
  await a.inject({ method: "POST", url: "/api/hack", payload: { message: "x" } });
  assert.ok(d.monitor.list().some((e) => e.status === 404));
});

test("GET /monitor отдаёт HTML", async () => {
  const r = await app().inject({ method: "GET", url: "/monitor" });
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["content-type"] as string, /html/);
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
