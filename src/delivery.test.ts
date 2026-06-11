import { test } from "node:test";
import assert from "node:assert/strict";
import { Inbox, deliver } from "./delivery.ts";
import type { Report } from "./report.ts";

const rep: Report = { generatedAt: "2026-06-11T09:00:00Z", items: [
  { title: "T", question: "q", response: "r", chart: null, insufficient_data: false, alert: false },
] };

test("deliver кладёт отчёт в инбокс", async () => {
  const inbox = new Inbox();
  await deliver(rep, { inbox });
  assert.equal(inbox.list().length, 1);
  assert.equal(inbox.list()[0].generatedAt, rep.generatedAt);
});

test("deliver вызывает webhook, если задан url (через инъекцию fetch)", async () => {
  const inbox = new Inbox();
  let called = "";
  const fakeFetch = async (url: string) => { called = url; return { ok: true } as Response; };
  await deliver(rep, { inbox, webhookUrl: "https://hook.example/x", fetchFn: fakeFetch as typeof fetch });
  assert.equal(called, "https://hook.example/x");
});
