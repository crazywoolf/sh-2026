import cron from "node-cron";
import type { FinalResponse, UserQuery } from "./contracts/types.ts";
import { compileReport, type CompileOpts } from "./report.ts";
import { deliver, type DeliverOpts } from "./delivery.ts";

type Pipeline = (q: UserQuery) => Promise<FinalResponse>;

// Возвращает async-задачу: собрать отчёт сейчас и доставить. Тестируется напрямую.
export function createReportJob(
  pipeline: Pipeline,
  deliverOpts: DeliverOpts,
  now: () => string = () => new Date().toISOString(),
  compileOpts?: CompileOpts,
): () => Promise<void> {
  return async () => {
    const report = await compileReport(pipeline, now(), compileOpts);
    await deliver(report, deliverOpts);
  };
}

// Запускает крон по выражению; возвращает функцию остановки. Тонкая обёртка (не юнит-тестируется).
export function startScheduler(cronExpr: string, job: () => Promise<void>): () => void {
  const task = cron.schedule(cronExpr, () => { void job(); });
  return () => task.stop();
}
