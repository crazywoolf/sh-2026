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

test("пустой sub_questions при bi → insufficient_data, без краха", async () => {
  const r = await runPipeline(agents({
    plan: async () => ({ mode: "bi", reasoning: "пусто", sub_questions: [] }),
  }), { message: "q" });
  assert.equal(r.insufficient_data, true);
  assert.ok(r.response.length > 0);
});

test("session_id генерируется, если не передан", async () => {
  const r = await runPipeline(agents({}), { message: "q" });
  assert.ok(r.session_id.startsWith("s-"));
  assert.ok(r.session_id.length > 3);
});

test("research: часть под-вопросов без данных → insufficient=false, синтез только из успешных", async () => {
  const r = await runPipeline(agents({
    plan: async () => ({ mode: "research", reasoning: "", sub_questions: ["good", "bad"] }),
    extract: async (q) => ({
      approach: "free_sql", sql: "", columns: [], rows: q === "good" ? [{ a: 1 }] : [],
      row_count: q === "good" ? 1 : 0, data_sufficient: q === "good", notes: "", assumptions: [],
    }),
    analyze: async (q) => ({
      answer: q === "good" ? "хороший ответ" : "данных недостаточно",
      key_findings: [], method: "", assumptions: [], caveats: [], confidence: "high",
    }),
  }), { message: "сложный" });
  assert.equal(r.insufficient_data, false);
  assert.match(r.response, /хороший ответ/);
  assert.ok(!r.response.includes("данных недостаточно"));
});
