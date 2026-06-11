import { PlannerOutputSchema, type PlannerOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — планировщик аналитической системы Meridian (B2B-маркетплейс).
Классифицируй вопрос руководителя:
- "bi": вопрос, отвечаемый ОДНИМ срезом данных (одна метрика/таблица, даже если с разбивкой по годам/сегментам/категориям и с динамикой). По умолчанию выбирай bi. sub_questions=[исходный вопрос целиком, БЕЗ дробления].
- "research": ТОЛЬКО если вопрос объективно требует НЕСКОЛЬКИХ независимых срезов данных (например «сравни отток И выручку И NPS»). Тогда 2-4 под-вопроса, каждый — самостоятельный осмысленный запрос.
- "insufficient": ответ невозможен по доступным данным (прогноз будущего; нужных полей/таблиц нет в витрине).
ВАЖНО: не дроби единый запрос на искусственные части (НЕ делай «выручка за 2023», «выручка за 2024» из вопроса про динамику по годам — это ОДИН bi-запрос). Лишнее дробление ломает ответ.
Данные охватывают 2023-01..2025-12. Верни JSON: {mode, reasoning, sub_questions[]}.`;

export async function plan(llm: LLMClient, question: string): Promise<PlannerOutput> {
  return callJSON(llm, SYSTEM, `Вопрос: ${question}`, PlannerOutputSchema);
}
