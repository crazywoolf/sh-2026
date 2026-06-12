import { test } from "node:test";
import assert from "node:assert/strict";
import { MonitorStore } from "./store.ts";

test("record/list: новейшие первыми", () => {
  let t = 1000;
  const s = new MonitorStore({ ttlMs: 60000, now: () => t });
  s.record({ path: "/api/chat", message: "q1", status: 200 });
  t = 2000;
  s.record({ path: "/api/chat", message: "q2", status: 200 });
  const l = s.list();
  assert.equal(l.length, 2);
  assert.equal(l[0].message, "q2");
  assert.ok(l[0].ts.includes("T")); // ISO-время проставлено
});

test("TTL: записи старше окна вытесняются", () => {
  let t = 0;
  const s = new MonitorStore({ ttlMs: 1000, now: () => t });
  s.record({ path: "/api/chat", message: "old", status: 200 });
  t = 2000; // прошло 2с > ttl 1с
  s.record({ path: "/api/chat", message: "new", status: 200 });
  const l = s.list();
  assert.equal(l.length, 1);
  assert.equal(l[0].message, "new");
});

test("JSONL: каждая запись дозаписывается строкой", () => {
  const lines: string[] = [];
  const s = new MonitorStore({ ttlMs: 60000, appendLine: (ln) => lines.push(ln) });
  s.record({ path: "/api/chat", message: "q", status: 200, mode: "bi", insufficient: false });
  assert.equal(lines.length, 1);
  const obj = JSON.parse(lines[0]);
  assert.equal(obj.message, "q");
  assert.equal(obj.mode, "bi");
});
