import { test } from "node:test";
import assert from "node:assert/strict";
import { runSelect, GuardError } from "./duck.ts";

test("SELECT возвращает строки", async () => {
  const r = await runSelect("SELECT name FROM product_lines WHERE product_line_id=3");
  assert.equal(r.rows[0].name, "Разработка и IT");
});

test("не-SELECT отклоняется", async () => {
  await assert.rejects(() => runSelect("DROP TABLE orders"), GuardError);
});

test("запрещённые объекты (_params) отклоняются", async () => {
  await assert.rejects(() => runSelect("SELECT * FROM _params"), GuardError);
});

test("авто-LIMIT ограничивает выдачу", async () => {
  const r = await runSelect("SELECT * FROM orders", 5);
  assert.ok(r.rows.length <= 5);
});
