import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionStore } from "./store.ts";

test("append/get возвращает историю по session_id", () => {
  const s = new SessionStore(3);
  s.append("a", "вопрос1", "ответ1");
  s.append("a", "вопрос2", "ответ2");
  const turns = s.get("a");
  assert.equal(turns.length, 2);
  assert.equal(turns[1].question, "вопрос2");
});

test("разные сессии изолированы; пустая сессия → []", () => {
  const s = new SessionStore(3);
  s.append("a", "q", "ans");
  assert.deepEqual(s.get("b"), []);
});

test("хранит не более K последних пар", () => {
  const s = new SessionStore(2);
  s.append("a", "q1", "a1");
  s.append("a", "q2", "a2");
  s.append("a", "q3", "a3");
  const turns = s.get("a");
  assert.equal(turns.length, 2);
  assert.equal(turns[0].question, "q2");
});
