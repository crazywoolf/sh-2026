import { z } from "zod";
import { StringArray } from "./contracts/types.ts";
import { callJSON } from "./llm/json.ts";
import type { LLMClient } from "./llm/client.ts";
import type { ReportItem } from "./report.ts";

const SYSTEM = `Ты — стратегический советник совета директоров Meridian (B2B-маркетплейс услуг).
На основе сводки метрик здоровья компании дай 2-4 КОРОТКИХ конкретных рекомендации.
Только на основе приведённых цифр, по делу, на русском, без воды и без общих фраз.
Каждая рекомендация — одна короткая строка с действием. Верни JSON {recommendations: [строки]}.`;

const Schema = z.object({ recommendations: StringArray });

// Возвращает функцию-советник: из пунктов отчёта делает 2-4 рекомендации.
// Сбой LLM не критичен — отчёт остаётся валидным без рекомендаций.
export function makeRecommender(llm: LLMClient): (items: ReportItem[]) => Promise<string[]> {
  return async (items) => {
    const summary = items
      .map((i) => `${i.title}: ${i.insufficient_data ? "[данных недостаточно]" : i.response}`)
      .join("\n");
    try {
      const r = await callJSON(llm, SYSTEM, summary, Schema);
      return r.recommendations.slice(0, 4);
    } catch {
      return [];
    }
  };
}
