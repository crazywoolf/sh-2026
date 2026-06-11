import { PlannerOutputSchema, type PlannerOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";
import type { Turn } from "../session/store.ts";

const SYSTEM = `Ты — планировщик аналитической системы Meridian (B2B-маркетплейс).
Классифицируй вопрос руководителя:
- "bi": вопрос, отвечаемый ОДНИМ срезом данных (одна метрика/таблица, даже с разбивкой по годам/сегментам/категориям и динамикой). По умолчанию выбирай bi. sub_questions=[исходный вопрос целиком, БЕЗ дробления].
- "research": если вопрос требует НЕСКОЛЬКИХ независимых срезов данных. Тогда 2-4 под-вопроса, каждый — самостоятельный осмысленный запрос.
- "insufficient": ответ невозможен по доступным данным (прогноз будущего; нужных полей/таблиц нет в витрине).
КОНТЕКСТ ДИАЛОГА: если он дан и текущий вопрос — уточнение (ссылается на предыдущий: «а по сегментам?», «в динамике»), РАЗРЕШИ ссылку: сформируй sub_questions как САМОДОСТАТОЧНЫЕ вопросы с подставленной темой из контекста.
Не дроби единый запрос на искусственные части. Данные охватывают 2023-01..2025-12.
Верни JSON: {mode, reasoning, sub_questions[]}.`;

export async function plan(
  llm: LLMClient,
  question: string,
  opts?: { context?: Turn[]; preferResearch?: boolean },
): Promise<PlannerOutput> {
  const ctx = opts?.context?.length
    ? "Контекст диалога (старые пары вопрос→ответ):\n" +
      opts.context.map((t) => `- В: ${t.question}\n  О: ${t.answer.slice(0, 300)}`).join("\n") + "\n\n"
    : "";
  const hint = opts?.preferResearch
    ? "Подсказка: пользователь ждёт ИССЛЕДОВАНИЕ — предпочитай mode=research с декомпозицией, если вопрос это допускает.\n"
    : "";
  return callJSON(llm, SYSTEM, `${ctx}${hint}Текущий вопрос: ${question}`, PlannerOutputSchema);
}
