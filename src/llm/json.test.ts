import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { callJSON } from "./json.ts";
import type { LLMClient } from "./client.ts";

const Schema = z.object({ ok: z.boolean() });

function fakeClient(replies: string[]): LLMClient {
  let i = 0;
  return { complete: async () => replies[i++] ?? "" };
}

test("парсит валидный JSON из ответа LLM", async () => {
  const c = fakeClient(['{"ok": true}']);
  const r = await callJSON(c, "sys", "user", Schema);
  assert.equal(r.ok, true);
});

test("вырезает ```json блоки", async () => {
  const c = fakeClient(["```json\n{\"ok\": false}\n```"]);
  const r = await callJSON(c, "sys", "user", Schema);
  assert.equal(r.ok, false);
});

test("ретраит один раз при кривом JSON, затем кидает", async () => {
  const c = fakeClient(["не json", "тоже не json"]);
  await assert.rejects(() => callJSON(c, "sys", "user", Schema));
});
