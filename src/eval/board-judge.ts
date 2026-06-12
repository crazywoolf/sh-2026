import { z } from "zod";
import { StringArray } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

export const BoardVerdictSchema = z.object({
  verdict: z.enum(["good", "partial", "poor"]),
  score: z.number(),
  gap: StringArray, // что улучшить / чего не хватает
});
export type BoardVerdict = z.infer<typeof BoardVerdictSchema>;

const DATA_CONTEXT = `Доступные данные витрины Meridian (2023-01..2025-12):
- financials_monthly: GMV, выручка (gross/net), take_rate, EBITDA, opex (агрегатом), headcount — помесячно.
- orders: заказы (gmv, revenue, status, provider_type, product_line_id).
- customers: сегмент(SMB/Mid/Large), отрасль, город, канал привлечения, даты регистрации/ухода, тип контракта.
- product_lines: 9 линий (категории high/mid/low margin, одна sunset).
- nps_responses: оценки NPS (promoter/passive/detractor), теги (в т.ч. ai_competitor).
- customer_activity_monthly: активность/статусы (active/churning/dormant/churned).
- churn_reasons: причины оттока (price/quality/ai_alternative/...), названный конкурент.
- unit_economics_monthly: CAC, LTV_12m, payback, маржа по сегменту×линии.
НЕТ: прибыль/cost по отдельному заказу, opex в разрезе линий, место оказания услуги (гео заказа), будущее (>2025-12), демография клиента.`;

const SYSTEM = `Ты — придирчивый член совета директоров Meridian. Оцени ОТВЕТ системы-аналитика на вопрос.
${DATA_CONTEXT}

Хороший ответ (good): конкретные цифры из данных + бизнес-интерпретация («что это значит») + честность о границах/допущениях.
Слабый (partial): есть что-то, но поверхностно, без интерпретации, неполно, или упущен важный нюанс.
Плохой (poor): фактическая ошибка/выдумка; ИЛИ отказ «недостаточно данных» на вопрос, который ОТВЕЧАЕМ из перечисленных данных (ложный отказ); ИЛИ общие слова без цифр.
Замечание: если вопрос реально вне данных (прогноз будущего, прибыль по заказу, opex по линиям) — честный отказ это ХОРОШО (good).
gap: 1-3 КОРОТКИХ пункта — чего не хватило / что улучшить (если good — можно пусто).
Верни JSON {verdict, score (0-100), gap: [строки]}.`;

export async function boardJudge(
  llm: LLMClient,
  question: string,
  systemAnswer: string,
): Promise<BoardVerdict> {
  const user = `Вопрос совета директоров: ${question}\n\nОТВЕТ СИСТЕМЫ:\n${systemAnswer.slice(0, 2500)}`;
  return callJSON(llm, SYSTEM, user, BoardVerdictSchema);
}
