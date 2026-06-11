import OpenAI from "openai";

export interface LLMClient {
  complete(system: string, user: string, opts?: { model?: string; temperature?: number }): Promise<string>;
}

export function createLLMClient(): LLMClient {
  const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY ?? "missing",
    baseURL: process.env.LLM_BASE_URL, // undefined → дефолт OpenAI
  });
  const defaultModel = process.env.LLM_MODEL ?? "gpt-4o-mini";
  return {
    async complete(system, user, opts) {
      const res = await client.chat.completions.create({
        model: opts?.model ?? defaultModel,
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
