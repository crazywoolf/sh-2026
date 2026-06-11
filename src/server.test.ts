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
