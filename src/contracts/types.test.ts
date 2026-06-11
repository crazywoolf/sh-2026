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
