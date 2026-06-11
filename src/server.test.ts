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
  const inbox = new Inbox();
  return {
    pipeline: async () => ok,
    inbox,
    compileNow: async (): Promise<Report> => ({ generatedAt: "t", items: [] }),
    deliver: async (r: Report) => { inbox.add(r); },
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
