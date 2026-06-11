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
