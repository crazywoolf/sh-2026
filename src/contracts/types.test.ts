import { test } from "node:test";
import assert from "node:assert/strict";
import { PlannerOutputSchema, CriticOutputSchema, FinalResponseSchema, AnalystOutputSchema } from "./types.ts";

test("AnalystOutput: key_findings из объектов коэрсятся в строки (не падает)", () => {
  const v = AnalystOutputSchema.parse({
    answer: "вывод",
    key_findings: [{ line: "IT", revenue: 100 }, "уже строка"],
    method: "sum",
    assumptions: null,
    caveats: "одиночная строка",
    confidence: "ультра",
  });
  assert.equal(typeof v.key_findings[0], "string");
  assert.deepEqual(v.assumptions, []);
  assert.deepEqual(v.caveats, ["одиночная строка"]);
  assert.equal(v.confidence, "medium"); // невалидное → дефолт
});

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
