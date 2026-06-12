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

const BRIEF_SYS = `Ты — стратегический советник совета директоров Meridian (B2B-маркетплейс услуг; выручка падает 2-й год, отток к AI-инструментам). На основе сводки метрик дай:
- "risks": 2-4 КЛЮЧЕВЫХ риска для компании, включая НЕОЧЕВИДНЫЕ («которых не замечают») и КОМПРОМИССЫ между метриками (напр.: удержание скидками бьёт по марже; рост активности ≠ рост выручки; уход в крупный сегмент роняет GMV; инвестиции в AI режут EBITDA; низкий NPS линии при ещё высокой выручке).
- "caveats": 1-3 оговорки о КАЧЕСТВЕ и ГРАНИЦАХ данных (напр.: orders и financials — независимые слои, нельзя складывать; линия «Консалтинг» закрыта (sunset); конкурент назван лишь у ~17% ушедших; данные только до 2025-12).
Только по приведённым данным, кратко, по делу, на русском. Верни JSON {risks:[строки], caveats:[строки]}.`;

const BriefSchema = z.object({ risks: StringArray, caveats: StringArray });
export type Briefing = z.infer<typeof BriefSchema>;

// Синтез «Риски + Качество данных» для отчёта. Сбой LLM не критичен.
export function makeBriefing(llm: LLMClient): (items: ReportItem[]) => Promise<Briefing> {
  return async (items) => {
    const summary = items
      .map((i) => `${i.title}: ${i.insufficient_data ? "[данных недостаточно]" : i.response}`)
      .join("\n");
    try {
      const r = await callJSON(llm, BRIEF_SYS, summary, BriefSchema);
      return { risks: r.risks.slice(0, 4), caveats: r.caveats.slice(0, 3) };
    } catch {
      return { risks: [], caveats: [] };
    }
  };
}
