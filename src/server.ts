import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import type { FinalResponse, UserQuery } from "./contracts/types.ts";
import type { Inbox } from "./delivery.ts";
import type { Report } from "./report.ts";
import type { Preset } from "./presets.ts";
import type { MonitorStore } from "./monitor/store.ts";

export type PipelineFn = (q: UserQuery) => Promise<FinalResponse>;
export type ServerDeps = {
  pipeline: PipelineFn;
  inbox: Inbox;
  compileNow: () => Promise<Report>;
  deliver: (r: Report) => Promise<void>;
  presets: Pick<Preset, "title" | "question">[];
  monitor: MonitorStore;
};

const PATHS = ["/api/chat", "/api/v1/chat", "/chat", "/api/ask", "/api/query"];
const WEB = resolve(process.cwd(), "web");
function readWeb(name: string): string { return readFileSync(resolve(WEB, name), "utf8"); }

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string") return b.message;
  if (typeof b.query === "string") return b.query;
  if (Array.isArray(b.messages)) {
    const last = [...b.messages].reverse().find((m) => m?.role === "user");
    if (last && typeof last.content === "string") return last.content;
  }
  return null;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((_err, req, reply) => {
    deps.monitor.record({ path: req.url, message: "<невалидный запрос/JSON>", status: 400 });
    return reply.code(400).send({ error: "ошибка запроса" });
  });
  app.setNotFoundHandler((req, reply) => {
    deps.monitor.record({ path: req.url, message: "", status: 404 });
    return reply.code(404).send({ error: "путь не найден" });
  });

  app.get("/health", async () => ({ status: "ok" }));

  const serve = (name: string, type: string) => async (_req: unknown, reply: { type: (t: string) => { send: (b: string) => unknown } }) =>
    reply.type(type).send(readWeb(name));
  app.get("/", serve("index.html", "text/html; charset=utf-8") as never);
  app.get("/app.js", serve("app.js", "application/javascript; charset=utf-8") as never);
  app.get("/styles.css", serve("styles.css", "text/css; charset=utf-8") as never);

  app.get("/api/presets", async () => deps.presets);
  app.post("/api/report", async (_req, reply) => {
    const rep = await deps.compileNow();
    await deps.deliver(rep); // инбокс + опц. webhook/Telegram
    return reply.code(200).send(rep);
  });
  app.get("/api/reports", async () => deps.inbox.list());

  // Мониторинг запросов (открытая read-only страница)
  app.get("/monitor", serve("monitor.html", "text/html; charset=utf-8") as never);
  app.get("/api/monitor/log", async () => deps.monitor.list());

  const handler = async (req: { body: unknown; url?: string }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const t0 = Date.now();
    const path = req.url ?? "/api/chat";
    const body = req.body;
    if (body === undefined || body === null || body === "") {
      deps.monitor.record({ path, message: "", status: 400, latency_ms: Date.now() - t0 });
      return reply.code(400).send({ error: "пустое тело" });
    }
    const message = extractMessage(body);
    if (message === null || message.trim() === "") {
      deps.monitor.record({ path, message: "", status: 422, latency_ms: Date.now() - t0 });
      return reply.code(422).send({ error: "отсутствует поле вопроса (message/query/messages)" });
    }
    const b = body as Record<string, unknown>;
    const session_id = typeof b.session_id === "string" ? b.session_id : undefined;
    const prefer_research = b.prefer_research === true;
    try {
      const res = await deps.pipeline({ message, session_id, prefer_research });
      deps.monitor.record({
        path, message, session_id, status: 200, latency_ms: Date.now() - t0,
        mode: res.plan?.mode, insufficient: res.insufficient_data,
        response_preview: res.response.slice(0, 200),
      });
      return reply.code(200).send(res);
    } catch {
      deps.monitor.record({ path, message, session_id, status: 200, latency_ms: Date.now() - t0, insufficient: true, response_preview: "ошибка обработки" });
      return reply.code(200).send({
        response: "Произошла внутренняя ошибка при обработке запроса.",
        assumptions: [], trace: [], chart: null, insufficient_data: true,
        session_id: session_id ?? "s-error",
      } satisfies FinalResponse);
    }
  };
  for (const p of PATHS) app.post(p, handler as never);
  return app;
}
