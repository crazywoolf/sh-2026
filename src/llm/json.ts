import type { ZodTypeAny } from "zod";
import type { LLMClient } from "./client.ts";

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}

export async function callJSON<S extends ZodTypeAny>(
  client: LLMClient, system: string, user: string, schema: S,
  opts?: { model?: string },
): Promise<S["_output"]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await client.complete(
      system + "\n\nОтвечай ТОЛЬКО валидным JSON, без пояснений.",
      user, { model: opts?.model },
    );
    try {
      return schema.parse(JSON.parse(extractJSON(raw)));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`LLM вернул невалидный JSON: ${String(lastErr)}`);
}
