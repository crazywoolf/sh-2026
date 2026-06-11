import { buildServer } from "./server.ts";
import { buildAgents } from "./wiring.ts";
import { runPipeline } from "./orchestrator.ts";
import { createLLMClient } from "./llm/client.ts";
import { SessionStore } from "./session/store.ts";
import { Inbox } from "./delivery.ts";
import { compileReport } from "./report.ts";
import { PRESETS } from "./presets.ts";
import { createReportJob, startScheduler } from "./scheduler.ts";
import type { UserQuery } from "./contracts/types.ts";

const agents = buildAgents(createLLMClient());
const sessions = new SessionStore(5);
const inbox = new Inbox();

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
const compileNow = () => compileReport(pipeline, new Date().toISOString());

const app = buildServer({ pipeline, inbox, compileNow, presets: PRESETS });

const cronExpr = process.env.SCHEDULE_CRON ?? "0 9 * * 1";
startScheduler(cronExpr, createReportJob(pipeline, deliverOpts));

const port = Number(process.env.PORT ?? 8000);
app.listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`Meridian on :${port} (schedule: ${cronExpr})`))
  .catch((e) => { console.error(e); process.exit(1); });
