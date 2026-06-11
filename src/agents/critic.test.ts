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
