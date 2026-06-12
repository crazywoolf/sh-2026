import OpenAI from "openai";

export interface LLMClient {
  complete(system: string, user: string, opts?: { model?: string; temperature?: number }): Promise<string>;
}

export type LLMConfig = {
  baseURL: string | undefined;
  apiKey: string;
  defaultModel: string;
  project?: string;
  defaultHeaders?: Record<string, string>;
};

// Извлекает идентификатор каталога из URI модели Yandex: gpt://<folder>/yandexgpt-5.1 → <folder>
export function folderFromModel(model: string): string | undefined {
  const m = model.match(/^gpt:\/\/([^/]+)\//);
  return m ? m[1] : undefined;
}

// Резолвер конфига LLM из env. OpenAI-совместимый; поддерживает Yandex AI Studio.
// По умолчанию — Bearer (как в примере Yandex). LLM_AUTH=api-key → схема "Authorization: Api-Key <key>".
// project (folder-id) берётся из LLM_PROJECT или автоматически из URI модели.
export function resolveLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMConfig {
  const apiKey = env.LLM_API_KEY ?? "missing";
  const baseURL = env.LLM_BASE_URL; // undefined → дефолт OpenAI
  const defaultModel = env.LLM_MODEL ?? "gpt-4o-mini";
  const scheme = (env.LLM_AUTH ?? "bearer").toLowerCase();
  const defaultHeaders = scheme === "api-key"
    ? { Authorization: `Api-Key ${apiKey}` }
    : undefined;
  const project = env.LLM_PROJECT ?? folderFromModel(defaultModel);
  return { baseURL, apiKey, defaultModel, project, defaultHeaders };
}

export function createLLMClient(): LLMClient {
  const cfg = resolveLLMConfig();
  // Таймаут на КАЖДЫЙ вызов LLM + 1 ретрай: чтобы один зависший вызов YandexGPT
  // не вешал весь запрос навсегда (защита от HTTP 0 у клиента). Настраивается LLM_TIMEOUT_MS.
  const timeout = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    project: cfg.project,
    defaultHeaders: cfg.defaultHeaders,
    timeout,
    maxRetries: 1,
  });
  return {
    async complete(system, user, opts) {
      const res = await client.chat.completions.create({
        model: opts?.model ?? cfg.defaultModel,
        temperature: opts?.temperature ?? 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
}
