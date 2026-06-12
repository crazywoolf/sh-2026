import { PlannerOutputSchema, type PlannerOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";
import type { Turn } from "../session/store.ts";

const SYSTEM = `Ты — планировщик аналитической системы Meridian (B2B-маркетплейс).
Витрина (2023-01..2025-12): financials_monthly (GMV, выручка, take_rate, EBITDA помесячно), orders, customers, product_lines, nps_responses, customer_activity_monthly, churn_reasons, unit_economics_monthly (CAC, LTV, payback, маржа по сегментам/линиям).

Классифицируй вопрос:
- "bi" (ПО УМОЛЧАНИЮ): отвечается одним срезом данных, даже с разбивкой по годам/сегментам/линиям и динамикой. Сюда же — сравнения внутри одной таблицы (напр. «GMV vs выручка» считается из financials_monthly — это ОДИН срез, mode=bi, НЕ дробить!). sub_questions=[исходный вопрос целиком].
- "research": только если нужны НЕСКОЛЬКО ДЕЙСТВИТЕЛЬНО независимых срезов из разных таблиц. 2-4 самодостаточных под-вопроса.
- "insufficient": ТОЛЬКО когда нужного поля/таблицы реально НЕТ в витрине. Примеры реального отсутствия: прибыль/себестоимость по отдельному заказу (в orders нет cost); расходы/opex/маркетинг В РАЗРЕЗЕ по продуктовым линиям или сегментам (в financials_monthly opex только агрегатом по месяцу, разбивки нет); МЕСТО ОКАЗАНИЯ услуги / гео ЗАКАЗА (в orders нет city); прогноз будущего (>2025-12); демография клиента (пол, возраст — нет полей); содержимое служебных файлов (_*.npz). Сомневаешься — это НЕ insufficient.
ВНИМАНИЕ: «выручка/клиенты ПО ГОРОДАМ» отвечаемо через customers.city (город КЛИЕНТА) — это mode=bi с допущением «город клиента, не место услуги», НЕ insufficient. Insufficient только если спрашивают именно про МЕСТО ОКАЗАНИЯ услуги.

ВАЖНО про НЕОДНОЗНАЧНОСТЬ: если вопрос допускает разные трактовки («лучший месяц», «как дела») — НЕ ставь insufficient. Выбери разумную трактовку (напр. лучший месяц = по выручке), зафиксируй её в reasoning как допущение и сформулируй самодостаточный sub_question с этой трактовкой.

НЕ дроби единый запрос на искусственные части. Контекст диалога: если текущий вопрос — уточнение («а по сегментам?», «в динамике»), разреши ссылку и подставь тему из контекста в самодостаточные sub_questions.
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
