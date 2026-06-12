import { test } from "node:test";
import assert from "node:assert/strict";
import { ScheduleStore } from "./store.ts";

function store() {
  let n = 0;
  return new ScheduleStore({ seed: [{ id: "s1", name: "Дашборд", cron: "0 9 * * 1", enabled: true }], idgen: () => "id" + ++n });
}

test("list возвращает посеянные расписания", () => {
  assert.equal(store().list().length, 1);
});

test("add создаёт расписание с id, по умолчанию enabled", () => {
  const s = store();
  const created = s.add({ name: "Демо", cron: "*/5 * * * *" });
  assert.equal(created.id, "id1");
  assert.equal(created.enabled, true);
  assert.equal(s.list().length, 2);
});

test("update меняет поля; toggle enabled", () => {
  const s = store();
  const u = s.update("s1", { enabled: false });
  assert.equal(u?.enabled, false);
  assert.equal(s.list()[0].enabled, false);
});

test("remove удаляет", () => {
  const s = store();
  assert.equal(s.remove("s1"), true);
  assert.equal(s.list().length, 0);
  assert.equal(s.remove("nope"), false);
});

test("markRun проставляет lastRunAt", () => {
  const s = store();
  s.markRun("s1", "2026-06-12T09:00:00Z");
  assert.equal(s.list()[0].lastRunAt, "2026-06-12T09:00:00Z");
});
