import { test } from "node:test";
import assert from "node:assert/strict";
import { judge } from "./judge.ts";
import type { LLMClient } from "../llm/client.ts";

const fake = (reply: string): LLMClient => ({ complete: async () => reply });

test("парсит вердикт судьи", async () => {
  const c = fake('{"verdict":"correct","score":95,"notes":"цифры совпадают"}');
  const v = await judge(c, "вопрос", "ответ системы", [{ y: 2024, rev: 100 }]);
  assert.equal(v.verdict, "correct");
  assert.equal(v.score, 95);
});

test("терпит notes=null (YandexGPT)", async () => {
  const c = fake('{"verdict":"wrong","score":10,"notes":null}');
  const v = await judge(c, "вопрос", "ответ", []);
  assert.equal(v.verdict, "wrong");
});
