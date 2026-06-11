import Fastify, { type FastifyInstance } from "fastify";
import type { FinalResponse, UserQuery } from "./contracts/types.ts";

export type PipelineFn = (q: UserQuery) => Promise<FinalResponse>;
const PATHS = ["/api/chat", "/api/v1/chat", "/chat", "/api/ask", "/api/query"];

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

export function buildServer(pipeline: PipelineFn): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err, _req, reply) => {
    if ((err as { statusCode?: number }).statusCode === 400) {
      return reply.code(400).send({ error: "невалидный JSON" });
    }
    return reply.code(400).send({ error: "ошибка запроса" });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "путь не найден" }));

  app.get("/health", async () => ({ status: "ok" }));

  const handler = async (req: { body: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const body = req.body;
    if (body === undefined || body === null || body === "") {
      return reply.code(400).send({ error: "пустое тело" });
    }
    const message = extractMessage(body);
    if (message === null || message.trim() === "") {
      return reply.code(422).send({ error: "отсутствует поле вопроса (message/query/messages)" });
    }
    const session_id = (body as Record<string, unknown>).session_id;
    try {
      const res = await pipeline({ message, session_id: typeof session_id === "string" ? session_id : undefined });
      return reply.code(200).send(res);
    } catch {
      return reply.code(200).send({
        response: "Произошла внутренняя ошибка при обработке запроса.",
        assumptions: [], trace: [], chart: null, insufficient_data: true,
        session_id: typeof session_id === "string" ? session_id : "s-error",
      } satisfies FinalResponse);
    }
  };

  for (const p of PATHS) app.post(p, handler as never);
  return app;
}
