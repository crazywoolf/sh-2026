import { PlannerOutputSchema, type PlannerOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — планировщик аналитической системы Meridian (B2B-маркетплейс).
Классифицируй вопрос руководителя:
- "bi": простой вопрос на один ответ → sub_questions=[исходный вопрос].
- "research": сложный/составной → разбей на 2-5 под-вопросов.
- "insufficient": ответ невозможен по доступным данным (прогноз будущего, данных нет в витрине).
Данные охватывают 2023-01..2025-12. Верни JSON: {mode, reasoning, sub_questions[]}.`;

export async function plan(llm: LLMClient, question: string): Promise<PlannerOutput> {
  return callJSON(llm, SYSTEM, `Вопрос: ${question}`, PlannerOutputSchema);
}
