import { test } from "node:test";
import assert from "node:assert/strict";
import { visualize } from "./visualizer.ts";
import type { LLMClient } from "../llm/client.ts";
import type { AnalystOutput, ExtractorOutput } from "../contracts/types.ts";

const fake = (reply: string): LLMClient => ({ complete: async () => reply });
const ext: ExtractorOutput = {
  approach: "metric_template", sql: "", columns: [], rows: [{ product_line: "IT", revenue: 1 }],
  row_count: 1, data_sufficient: true, notes: "", assumptions: [],
};
const ana: AnalystOutput = { answer: "a", key_findings: [], method: "", assumptions: [], caveats: [], confidence: "high" };

test("возвращает bar-chart", async () => {
  const c = fake('{"chart":{"type":"bar","title":"Выручка","x":"product_line","y":"revenue","data":[{"product_line":"IT","revenue":1}]},"rationale":"сравнение категорий"}');
  const r = await visualize(c, ana, ext);
  assert.equal(r.chart?.type, "bar");
});

test("может вернуть null-chart", async () => {
  const c = fake('{"chart":null,"rationale":"нет смысла"}');
  const r = await visualize(c, ana, ext);
  assert.equal(r.chart, null);
});
