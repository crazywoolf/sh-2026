import { test } from "node:test";
import assert from "node:assert/strict";
import { Inbox, deliver, reportToText } from "./delivery.ts";
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

test("reportToText: HTML-форматирование, маркеры, человекочитаемая дата, без сырого ISO", () => {
  const r: Report = { generatedAt: "2026-06-11T09:00:00Z", items: [
    { title: "Выручка <тест>", question: "q", response: "Длинный ответ. Второе предложение тоже есть.", chart: null, insufficient_data: false, alert: true },
    { title: "Прогноз", question: "q", response: "нет данных", chart: null, insufficient_data: true, alert: false },
  ] };
  const t = reportToText(r);
  assert.match(t, /<b>Дашборд здоровья Meridian<\/b>/);
  assert.ok(!t.includes("2026-06-11T09:00:00Z"), "сырой ISO не должен попадать в текст");
  assert.match(t, /⚠️ <b>Выручка &lt;тест&gt;<\/b>/); // alert + экранирование HTML
  assert.match(t, /❔ <b>Прогноз<\/b>/);              // insufficient → ❔
});

test("deliver шлёт в Telegram с parse_mode HTML", async () => {
  const inbox = new Inbox();
  let body: any = null;
  const fakeFetch = async (_url: string, init: any) => { body = JSON.parse(init.body); return { ok: true } as Response; };
  await deliver(rep, { inbox, telegram: { token: "t", chatId: "123" }, fetchFn: fakeFetch as typeof fetch });
  assert.equal(body.parse_mode, "HTML");
  assert.equal(body.chat_id, "123");
});
