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
