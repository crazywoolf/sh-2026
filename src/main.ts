import { buildServer } from "./server.ts";
import { buildAgents } from "./wiring.ts";
import { runPipeline } from "./orchestrator.ts";
import { createLLMClient } from "./llm/client.ts";
import { SessionStore } from "./session/store.ts";
import { Inbox, deliver as deliverReport } from "./delivery.ts";
import { compileReport, type Report } from "./report.ts";
import { PRESETS } from "./presets.ts";
import { makeRecommender } from "./recommend.ts";
import { MonitorStore } from "./monitor/store.ts";
import { ScheduleStore, type Schedule } from "./schedules/store.ts";
import { ScheduleManager } from "./schedules/manager.ts";
import type { UserQuery } from "./contracts/types.ts";

const LOG_DIR = process.env.MONITOR_LOG_DIR ?? "logs";

const llm = createLLMClient();
const agents = buildAgents(llm);
const recommend = makeRecommender(llm);
const sessions = new SessionStore(5);
const inbox = new Inbox();
const monitor = new MonitorStore({
  ttlMs: Number(process.env.MONITOR_TTL_MIN ?? 60) * 60_000,
  logFile: `${LOG_DIR}/requests.jsonl`,
});

const pipeline = async (q: UserQuery) => {
  const context = q.session_id ? sessions.get(q.session_id) : [];
  const res = await runPipeline(agents, q, { context, preferResearch: q.prefer_research });
  if (res.session_id) sessions.append(res.session_id, q.message, res.response);
  return res;
};

const deliverOpts = {
  inbox,
  webhookUrl: process.env.REPORT_WEBHOOK,
  telegram: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    ? { token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }
    : undefined,
};
const compileNow = () => compileReport(pipeline, new Date().toISOString(), { recommend });
const deliver = (rep: Report) => deliverReport(rep, deliverOpts);

// Расписания автоотчётов: персистентный store + динамический планировщик
const schedules = new ScheduleStore({
  file: `${LOG_DIR}/schedules.json`,
  seed: [{ id: "health", name: "Дашборд здоровья", cron: process.env.SCHEDULE_CRON ?? "0 9 * * 1", enabled: true }],
});
const runFor = async (s: Schedule) => {
  const report = await compileReport(pipeline, new Date().toISOString(), { recommend });
  await deliver(report);
  schedules.markRun(s.id, new Date().toISOString());
};
const manager = new ScheduleManager(schedules, runFor);
manager.reconcile();

const app = buildServer({
  pipeline, inbox, compileNow, deliver, presets: PRESETS, monitor,
  schedules, reconcileSchedules: () => manager.reconcile(),
});

const port = Number(process.env.PORT ?? 8000);
app.listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`Meridian on :${port} (расписаний активно: ${manager.activeCount()})`))
  .catch((e) => { console.error(e); process.exit(1); });
