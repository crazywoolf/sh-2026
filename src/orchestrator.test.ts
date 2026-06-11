import { test } from "node:test";
import assert from "node:assert/strict";
import { runPipeline, type Agents } from "./orchestrator.ts";

function agents(over: Partial<Agents>): Agents {
  return {
    plan: async () => ({ mode: "bi", reasoning: "", sub_questions: ["q"] }),
    extract: async () => ({ approach: "free_sql", sql: "SELECT 1", columns: [], rows: [{ a: 1 }], row_count: 1, data_sufficient: true, notes: "", assumptions: [] }),
    analyze: async () => ({ answer: "ответ", key_findings: [], method: "", assumptions: [], caveats: [], confidence: "high" }),
    critique: async () => ({ verdict: "approved", checks: [], issues: [] }),
    visualize: async () => ({ chart: null, rationale: "" }),
    ...over,
  };
}

test("bi happy-path → insufficient_data=false, есть ответ", async () => {
  const r = await runPipeline(agents({}), { message: "q" });
  assert.equal(r.insufficient_data, false);
  assert.equal(r.response, "ответ");
});

test("planner insufficient → короткое замыкание", async () => {
  const r = await runPipeline(agents({ plan: async () => ({ mode: "insufficient", reasoning: "нет данных", sub_questions: [] }) }), { message: "q" });
  assert.equal(r.insufficient_data, true);
});

test("critic revise дважды → не зацикливается (≤2 повтора)", async () => {
  let calls = 0;
  const r = await runPipeline(agents({
    critique: async () => { calls++; return { verdict: "revise", target: "analyst", guidance: "g", checks: [], issues: ["x"] }; },
  }), { message: "q" });
  assert.ok(calls <= 3, `критик вызван ${calls} раз`);
  assert.ok(r.response.length > 0);
});

test("extractor data_sufficient=false → insufficient_data=true", async () => {
  const r = await runPipeline(agents({
    extract: async () => ({ approach: "free_sql", sql: "", columns: [], rows: [], row_count: 0, data_sufficient: false, notes: "", assumptions: [] }),
  }), { message: "q" });
  assert.equal(r.insufficient_data, true);
});
