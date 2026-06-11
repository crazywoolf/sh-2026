import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRecommender } from "./recommend.ts";
import type { LLMClient } from "./llm/client.ts";
import type { ReportItem } from "./report.ts";

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
