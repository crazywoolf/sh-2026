import { VizOutputSchema, type VizOutput, type AnalystOutput, type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — Visualization системы Meridian. Подбери тип графика под данные:
line (динамика во времени), bar (сравнение категорий), grouped_bar (категории×серии),
pie (структура целого), scatter (связь), table (если график не нужен). Если визуализация бессмысленна — chart=null.
Формат строго: {"chart": {"type": "<вид>", "title": "<строка>", "x": "<колонка>", "y": "<колонка>", "data": [<строки>]} | null, "rationale": "<строка>"}.
x/y — имена колонок из данных; data — те же строки. Если сомневаешься — верни chart=null.`;

// Визуализация опциональна (10% оценки): её сбой не должен ронять весь ответ.
// При некорректной спецификации от LLM деградируем к chart=null.
export async function visualize(
  llm: LLMClient, ana: AnalystOutput, ext: ExtractorOutput,
): Promise<VizOutput> {
  const user = `Вывод: ${ana.answer}
Колонки: ${JSON.stringify(ext.columns)}
Строки (до 50): ${JSON.stringify(ext.rows.slice(0, 50))}`;
  try {
    return await callJSON(llm, SYSTEM, user, VizOutputSchema);
  } catch {
    return { chart: null, rationale: "график не построен: некорректная спецификация от модели" };
  }
}
