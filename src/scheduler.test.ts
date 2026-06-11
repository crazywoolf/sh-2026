import { test } from "node:test";
import assert from "node:assert/strict";
import { createReportJob } from "./scheduler.ts";
import { Inbox } from "./delivery.ts";

test("job собирает отчёт и доставляет в инбокс", async () => {
  const inbox = new Inbox();
  const fakePipeline = async (q: { message: string }) => ({
    response: "ок " + q.message, assumptions: [], trace: [], chart: null,
    insufficient_data: false, session_id: "s",
  });
  const job = createReportJob(fakePipeline, { inbox }, () => "2026-06-11T09:00:00Z");
  await job();
  assert.equal(inbox.list().length, 1);
  assert.ok(inbox.list()[0].items.length >= 5);
});
