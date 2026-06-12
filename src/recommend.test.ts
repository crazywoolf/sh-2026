import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRecommender, makeBriefing } from "./recommend.ts";
import type { LLMClient } from "./llm/client.ts";
import type { ReportItem } from "./report.ts";

test("makeBriefing возвращает риски и оговорки качества данных", async () => {
  const llm: LLMClient = { complete: async () => '{"risks":["SMB убыточен","рост активности не даёт выручки"],"caveats":["orders и financials — разные слои"]}' };
  const items2: ReportItem[] = [{ title: "T", question: "q", response: "x", chart: null, insufficient_data: false, alert: false }];
  const b = await makeBriefing(llm)(items2);
  assert.equal(b.risks.length, 2);
  assert.match(b.caveats[0], /разные слои/);
});

test("makeBriefing: сбой LLM → пустые списки", async () => {
  const llm: LLMClient = { complete: async () => "не json" };
  const b = await makeBriefing(llm)([{ title: "T", question: "q", response: "x", chart: null, insufficient_data: false, alert: false }]);
  assert.deepEqual(b, { risks: [], caveats: [] });
});

const items: ReportItem[] = [
  { title: "Юнит-экономика", question: "q", response: "SMB LTV/CAC 0.59", chart: null, insufficient_data: false, alert: true },
];

test("makeRecommender возвращает рекомендации из ответа LLM", async () => {
  const llm: LLMClient = { complete: async () => '{"recommendations":["Сократить расходы на привлечение SMB","Усилить удержание Mid"]}' };
  const recs = await makeRecommender(llm)(items);
  assert.equal(recs.length, 2);
  assert.match(recs[0], /SMB/);
});

test("ограничивает до 4 рекомендаций", async () => {
  const llm: LLMClient = { complete: async () => '{"recommendations":["a","b","c","d","e","f"]}' };
  const recs = await makeRecommender(llm)(items);
  assert.equal(recs.length, 4);
});

test("сбой LLM → пустой список (отчёт не ломается)", async () => {
  const llm: LLMClient = { complete: async () => "не json" };
  const recs = await makeRecommender(llm)(items);
  assert.deepEqual(recs, []);
});
