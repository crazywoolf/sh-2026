import cron from "node-cron";
import type { ScheduleStore, Schedule } from "./store.ts";

type CronTask = { stop: () => void };
type ScheduleFn = (expr: string, fn: () => void) => CronTask;
type ValidateFn = (expr: string) => boolean;

// Динамический планировщик: держит cron-задачи синхронно с ScheduleStore.
export class ScheduleManager {
  private tasks = new Map<string, CronTask>();

  constructor(
    private store: ScheduleStore,
    private runFor: (s: Schedule) => Promise<void>,
    private scheduleFn: ScheduleFn = (e, f) => cron.schedule(e, f) as unknown as CronTask,
    private validateFn: ValidateFn = (e) => cron.validate(e),
  ) {}

  reconcile(): void {
    for (const t of this.tasks.values()) t.stop();
    this.tasks.clear();
    for (const s of this.store.list()) {
      if (!s.enabled || !this.validateFn(s.cron)) continue;
      const task = this.scheduleFn(s.cron, () => { void this.runFor(s); });
      this.tasks.set(s.id, task);
    }
  }

  activeCount(): number { return this.tasks.size; }
}
