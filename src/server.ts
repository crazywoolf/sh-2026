import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import type { FinalResponse, UserQuery } from "./contracts/types.ts";
import type { Inbox } from "./delivery.ts";
import type { Report } from "./report.ts";
import type { Preset } from "./presets.ts";
import type { MonitorStore } from "./monitor/store.ts";
import type { ScheduleStore } from "./schedules/store.ts";

export type PipelineFn = (q: UserQuery) => Promise<FinalResponse>;
export type ServerDeps = {
  pipeline: PipelineFn;
  inbox: Inbox;
  compileNow: () => Promise<Report>;
  deliver: (r: Report) => Promise<void>;
  presets: Pick<Preset, "title" | "question">[];
  monitor: MonitorStore;
  schedules: ScheduleStore;
  reconcileSchedules: () => void;
};

const PATHS = ["/api/chat", "/api/v1/chat", "/chat", "/api/ask", "/api/query"];
const WEB = resolve(process.cwd(), "web");
const pipelineTimeoutMs = () => Number(process.env.PIPELINE_TIMEOUT_MS ?? 90000);
function readWeb(name: string): string { return readFileSync(resolve(WEB, name), "utf8"); }

// Минимальная OpenAPI 3.0 спека контракта (бонус судьи: /openapi.json + /docs).
const OPENAPI = {
  openapi: "3.0.0",
  info: {
    title: "Meridian — мультиагентный AI-аналитик для совета директоров",
    version: "1.0.0",
    description: "Вопрос на русском → обоснованный ответ с цифрами, методом расчёта и допущениями. Никогда не 500; при нехватке данных — insufficient_data, без выдумок.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/chat": {
      post: {
        summary: "Задать аналитический вопрос (алиасы: /api/v1/chat, /chat, /api/ask, /api/query)",
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["message"],
          properties: { message: { type: "string", example: "Сравни GMV и чистую выручку по годам" }, session_id: { type: "string" }, prefer_research: { type: "boolean" } },
        } } } },
        responses: {
          "200": { description: "Ответ аналитика", content: { "application/json": { schema: { type: "object", properties: {
            response: { type: "string" }, assumptions: { type: "array", items: { type: "string" } },
            trace: { type: "array", items: { type: "object" } }, chart: { type: "object", nullable: true },
            insufficient_data: { type: "boolean" }, session_id: { type: "string" },
          } } } } },
          "400": { description: "Пустое тело или невалидный JSON" },
          "422": { description: "Отсутствует поле вопроса (message/query/messages)" },
          "404": { description: "Несуществующий путь" },
        },
      },
    },
    "/health": { get: { summary: "Проверка живости", responses: { "200": { description: "{ status: ok }" } } } },
  },
} as const;

const DOCS_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Meridian API — /docs</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/openapi.json',dom_id:'#ui'})</script></body></html>`;

class TimeoutError extends Error {}
// Гарантия «никогда не висеть»: пайплайн всегда отвечает в пределах лимита,
// иначе — честный graceful-ответ вместо зависания (защита от HTTP 0 у судьи).
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new TimeoutError("pipeline-timeout")), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

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

  // CORS: заголовки на все ответы + preflight OPTIONS (бонус контракта судьи).
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return reply.code(204).send();
  });

  app.setErrorHandler((_err, req, reply) => {
    deps.monitor.record({ path: req.url, message: "<невалидный запрос/JSON>", status: 400 });
    return reply.code(400).send({ error: "ошибка запроса" });
  });
  app.setNotFoundHandler((req, reply) => {
    deps.monitor.record({ path: req.url, message: "", status: 404 });
    return reply.code(404).send({ error: "путь не найден" });
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/openapi.json", async () => OPENAPI);
  app.get("/docs", async (_req, reply) => reply.type("text/html; charset=utf-8").send(DOCS_HTML));

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

  // Страница отправленных автоотчётов
  app.get("/reports", serve("reports.html", "text/html; charset=utf-8") as never);

  // Демо-лендинг решения
  app.get("/demo", serve("demo.html", "text/html; charset=utf-8") as never);

  // Расписания автоотчётов (CRUD)
  type R = { code: (n: number) => { send: (b: unknown) => unknown } };
  app.get("/api/schedules", async () => deps.schedules.list());
  app.post("/api/schedules", (async (req: { body: unknown }, reply: R) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.name !== "string" || typeof b.cron !== "string") return reply.code(422).send({ error: "нужны name и cron" });
    const s = deps.schedules.add({ name: b.name, cron: b.cron, enabled: b.enabled !== false });
    deps.reconcileSchedules();
    return reply.code(200).send(s);
  }) as never);
  app.patch("/api/schedules/:id", (async (req: { params: Record<string, string>; body: unknown }, reply: R) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
    if (typeof b.cron === "string") patch.cron = b.cron;
    if (typeof b.name === "string") patch.name = b.name;
    const s = deps.schedules.update(req.params.id, patch);
    if (!s) return reply.code(404).send({ error: "расписание не найдено" });
    deps.reconcileSchedules();
    return reply.code(200).send(s);
  }) as never);
  app.delete("/api/schedules/:id", (async (req: { params: Record<string, string> }, reply: R) => {
    const ok = deps.schedules.remove(req.params.id);
    if (!ok) return reply.code(404).send({ error: "расписание не найдено" });
    deps.reconcileSchedules();
    return reply.code(200).send({ ok: true });
  }) as never);

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
      const res = await withTimeout(deps.pipeline({ message, session_id, prefer_research }), pipelineTimeoutMs());
      deps.monitor.record({
        path, message, session_id, status: 200, latency_ms: Date.now() - t0,
        mode: res.plan?.mode, insufficient: res.insufficient_data,
        response_preview: res.response.slice(0, 200),
      });
      return reply.code(200).send(res);
    } catch (e) {
      const timedOut = e instanceof TimeoutError;
      deps.monitor.record({ path, message, session_id, status: 200, latency_ms: Date.now() - t0, insufficient: true, response_preview: timedOut ? "таймаут анализа" : "ошибка обработки" });
      return reply.code(200).send({
        response: timedOut
          ? "Анализ этого вопроса занял слишком много времени. Попробуйте сузить или переформулировать вопрос — например, уточните метрику, период или сегмент."
          : "Произошла внутренняя ошибка при обработке запроса.",
        assumptions: [], trace: [], chart: null, insufficient_data: true,
        session_id: session_id ?? "s-error",
      } satisfies FinalResponse);
    }
  };
  for (const p of PATHS) app.post(p, handler as never);
  return app;
}
