import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgents } from "./wiring.ts";
import { runPipeline } from "./orchestrator.ts";
import type { LLMClient } from "./llm/client.ts";

function scriptedLLM(): LLMClient {
  const byMarker = (sys: string): string => {
    // Уникальные маркеры «Ты — <роль>» (встречаются только в собственном промпте агента,
    // в отличие от перекрёстных упоминаний ролей внутри других промптов).
    if (sys.includes("Ты — планировщик")) return '{"mode":"bi","reasoning":"простой","sub_questions":["выручка по продуктовым линиям"]}';
    if (sys.includes("Ты — Extractor")) return '{"approach":"metric_template","metric_id":"revenue_by_product_line","reason":"подходит"}';
    if (sys.includes("Ты — Analyst")) return '{"answer":"Лидер по выручке — Разработка и IT","key_findings":["IT лидирует"],"method":"sum(revenue) по completed","assumptions":[],"caveats":[],"confidence":"high"}';
    if (sys.includes("Ты — Critic")) return '{"verdict":"approved","checks":[{"name":"status filter","passed":true,"comment":"ok"}],"issues":[]}';
    if (sys.includes("Ты — Visualization")) return '{"chart":{"type":"bar","title":"Выручка по линиям","x":"product_line","y":"revenue","data":[]},"rationale":"сравнение категорий"}';
    return "{}";
  };
  return { complete: async (system) => byMarker(system) };
}

test("e2e: простой вопрос проходит весь пайплайн на реальной БД", async () => {
  const agents = buildAgents(scriptedLLM());
  const r = await runPipeline(agents, { message: "покажи выручку по продуктовым линиям" });
  assert.equal(r.insufficient_data, false);
  assert.match(r.response, /Разработка и IT/);
  assert.equal(r.chart?.type, "bar");
  const ext = r.trace.find((t) => t.agent === "extractor");
  assert.ok((ext?.rows ?? 0) > 0, "extractor получил строки из БД");
});
