import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "./presets.ts";
import { compileReport } from "./report.ts";

test("есть пресет-вопросы здоровья", () => {
  assert.ok(PRESETS.length >= 5);
  assert.ok(PRESETS.every((p) => typeof p.question === "string"));
});

test("compileReport прогоняет пресеты через переданный pipeline", async () => {
  const fakePipeline = async (q: { message: string }) => ({
    response: "ответ на " + q.message, assumptions: [], trace: [], chart: null,
    insufficient_data: false, session_id: "s",
  });
  const rep = await compileReport(fakePipeline, "2026-06-11T09:00:00Z");
  assert.equal(rep.items.length, PRESETS.length);
  assert.equal(rep.generatedAt, "2026-06-11T09:00:00Z");
  assert.match(rep.items[0].response, /ответ на/);
});
