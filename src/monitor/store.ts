import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type LogEntry = {
  ts: string;          // ISO-время
  tsMs: number;        // для TTL-вытеснения
  path: string;
  message: string;
  session_id?: string;
  mode?: string;
  insufficient?: boolean;
  status: number;
  latency_ms?: number;
  response_preview?: string;
};

export type MonitorOpts = {
  ttlMs?: number;
  logFile?: string;                 // путь к JSONL; если задан — дозапись
  now?: () => number;               // инъекция времени для тестов
  appendLine?: (line: string) => void; // инъекция записи для тестов
};

// Хранилище запросов: окно последних N минут в памяти + дозапись в JSONL.
export class MonitorStore {
  private entries: LogEntry[] = [];
  private ttlMs: number;
  private now: () => number;
  private append: (line: string) => void;

  constructor(opts: MonitorOpts = {}) {
    this.ttlMs = opts.ttlMs ?? 60 * 60 * 1000;
    this.now = opts.now ?? (() => Date.now());
    if (opts.appendLine) {
      this.append = opts.appendLine;
    } else if (opts.logFile) {
      const f = opts.logFile;
      try { mkdirSync(dirname(f), { recursive: true }); } catch { /* */ }
      this.append = (line) => { try { appendFileSync(f, line + "\n"); } catch { /* запись не критична */ } };
    } else {
      this.append = () => {};
    }
  }

  record(e: Omit<LogEntry, "ts" | "tsMs">): void {
    const tsMs = this.now();
    const entry: LogEntry = { ...e, tsMs, ts: new Date(tsMs).toISOString() };
    this.entries.push(entry);
    this.evict();
    this.append(JSON.stringify(entry));
  }

  list(): LogEntry[] {
    this.evict();
    return [...this.entries].reverse(); // новейшие первыми
  }

  private evict(): void {
    const cutoff = this.now() - this.ttlMs;
    if (this.entries.length && this.entries[0].tsMs < cutoff) {
      this.entries = this.entries.filter((e) => e.tsMs >= cutoff);
    }
  }
}
