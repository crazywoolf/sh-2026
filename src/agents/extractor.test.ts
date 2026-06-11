import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "./extractor.ts";
import type { LLMClient } from "../llm/client.ts";

const fake = (reply: string): LLMClient => ({ complete: async () => reply });

test("metric_template: выбирает метрику и выполняет SQL", async () => {
  const c = fake('{"approach":"metric_template","metric_id":"revenue_by_product_line","reason":"подходит"}');
  const r = await extract(c, "выручка по продуктовым линиям");
  assert.equal(r.approach, "metric_template");
  assert.ok(r.row_count > 0);
  assert.equal(r.data_sufficient, true);
});

test("free_sql: guarded запрос выполняется", async () => {
  const c = fake('{"approach":"free_sql","sql":"SELECT count(*) AS n FROM customers","reason":"кастом"}');
  const r = await extract(c, "сколько всего клиентов");
  assert.equal(r.approach, "free_sql");
  assert.equal(r.row_count, 1);
});

test("небезопасный SQL → data_sufficient=false, без падения", async () => {
  const c = fake('{"approach":"free_sql","sql":"DROP TABLE orders","reason":"x"}');
  const r = await extract(c, "удали всё");
  assert.equal(r.data_sufficient, false);
});
