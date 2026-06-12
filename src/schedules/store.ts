import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export type Schedule = {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  lastRunAt?: string;
};

export type ScheduleStoreOpts = {
  seed?: Schedule[];
  file?: string;             // путь к JSON для персистентности
  idgen?: () => string;
};

// Хранилище расписаний автоотчётов: память + опц. персистентность в JSON.
export class ScheduleStore {
  private items: Schedule[] = [];
  private file?: string;
  private idgen: () => string;

  constructor(opts: ScheduleStoreOpts = {}) {
    this.file = opts.file;
    this.idgen = opts.idgen ?? (() => randomUUID());
    if (this.file) {
      try { this.items = JSON.parse(readFileSync(this.file, "utf8")); } catch { /* нет файла — стартуем с seed */ }
    }
    if (!this.items.length && opts.seed) this.items = opts.seed.map((s) => ({ ...s }));
  }

  list(): Schedule[] { return this.items.map((s) => ({ ...s })); }

  add(input: { name: string; cron: string; enabled?: boolean }): Schedule {
    const s: Schedule = { id: this.idgen(), name: input.name, cron: input.cron, enabled: input.enabled ?? true };
    this.items.push(s); this.persist();
    return { ...s };
  }

  update(id: string, patch: Partial<Pick<Schedule, "name" | "cron" | "enabled">>): Schedule | undefined {
    const s = this.items.find((x) => x.id === id);
    if (!s) return undefined;
    Object.assign(s, patch); this.persist();
    return { ...s };
  }

  remove(id: string): boolean {
    const n = this.items.length;
    this.items = this.items.filter((x) => x.id !== id);
    if (this.items.length !== n) { this.persist(); return true; }
    return false;
  }

  markRun(id: string, at: string): void {
    const s = this.items.find((x) => x.id === id);
    if (s) { s.lastRunAt = at; this.persist(); }
  }

  private persist(): void {
    if (!this.file) return;
    try { mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(this.file, JSON.stringify(this.items, null, 2)); }
    catch { /* запись не критична */ }
  }
}
