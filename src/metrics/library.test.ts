import { test } from "node:test";
import assert from "node:assert/strict";
import { METRICS, findMetric } from "./library.ts";
import { runSelect } from "../db/duck.ts";

test("есть метрика выручки по линиям", () => {
  assert.ok(findMetric("revenue_by_product_line"));
});

test("каждый SQL метрики выполняется на БД", async () => {
  for (const m of METRICS) {
    const r = await runSelect(m.sql);
    assert.ok(r.rows.length >= 0, `метрика ${m.id} вернула результат`);
  }
});

test("неизвестная метрика → undefined", () => {
  assert.equal(findMetric("nope"), undefined);
});
