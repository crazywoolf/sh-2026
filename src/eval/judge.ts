import { z } from "zod";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

export const JudgeVerdictSchema = z.object({
  verdict: z.enum(["correct", "partial", "wrong"]),
  score: z.number(),
  notes: z.string().nullish(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

const SYSTEM = `Ты — строгий судья аналитической системы Meridian (как жюри хакатона).
Тебе дают: вопрос, ЭТАЛОННЫЕ данные (истина, полученные SQL-запросом к БД) и ОТВЕТ системы.
Оцени ФАКТИЧЕСКУЮ корректность ответа относительно эталона:
- "correct": ключевые цифры и вывод соответствуют эталону (мелкие отличия форматирования допустимы);
- "partial": частично верно, но есть пропуски или неполнота;
- "wrong": фактическая ошибка, галлюцинация или выдуманные цифры.
score: 0-100 (насколько ответ точен и полезен). notes: кратко что не так (или "ок").
Верни JSON {verdict, score, notes}.`;

export async function judge(
  llm: LLMClient,
  question: string,
  systemAnswer: string,
  referenceRows: unknown[],
): Promise<JudgeVerdict> {
  const user = `Вопрос: ${question}
ЭТАЛОН (истина из БД): ${JSON.stringify(referenceRows).slice(0, 4000)}
ОТВЕТ СИСТЕМЫ: ${systemAnswer}`;
  return callJSON(llm, SYSTEM, user, JudgeVerdictSchema);
}
