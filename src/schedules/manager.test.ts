import { test } from "node:test";
import assert from "node:assert/strict";
import { ScheduleManager } from "./manager.ts";
import { ScheduleStore } from "./store.ts";

function setup() {
  const store = new ScheduleStore({
    seed: [
      { id: "a", name: "вкл", cron: "*/5 * * * *", enabled: true },
      { id: "b", name: "выкл", cron: "0 9 * * 1", enabled: false },
      { id: "c", name: "битый", cron: "не-крон", enabled: true },
    ],
  });
  const registered: string[] = [];
  const tasks: { stop: () => void }[] = [];
  const scheduleFn = (expr: string) => { registered.push(expr); const t = { stop: () => {} }; tasks.push(t); return t; };
  const validateFn = (expr: string) => /^[\d*/, -]+$/.test(expr);
  const mgr = new ScheduleManager(store, async () => {}, scheduleFn, validateFn);
  return { store, mgr, registered };
}

test("reconcile регистрирует только enabled с валидным cron", () => {
  const { mgr, registered } = setup();
  mgr.reconcile();
  assert.equal(mgr.activeCount(), 1);       // только 'a' (вкл+валидный)
  assert.deepEqual(registered, ["*/5 * * * *"]);
});

test("после включения расписания reconcile поднимает его", () => {
  const { store, mgr } = setup();
  mgr.reconcile();
  store.update("b", { enabled: true });
  mgr.reconcile();
  assert.equal(mgr.activeCount(), 2);       // 'a' и 'b'
});
