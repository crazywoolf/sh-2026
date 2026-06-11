import { AnalystOutputSchema, type AnalystOutput, type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — Analyst системы Meridian с инженерной культурой: "вот цифры, вот метод, вот допущения".
На вход — вопрос и результат SQL. Дай вывод на РУССКОМ строго по цифрам из данных, не выдумывай.
ПОЛНОТА: приводи ВСЕ строки/категории из данных (не только топ-2-3), и для каждой — все ключевые числа,
которые есть в строках (значение, проценты, итоги). Не опускай столбцы и не сокращай список без причины.
Если в данных есть и абсолютные значения, и проценты/доли — приводи и то, и другое.
Если data_sufficient=false — честно скажи, что данных недостаточно (answer об этом, confidence "low").
Верни JSON {answer, key_findings[], method, assumptions[], caveats[], confidence: high|medium|low}.`;

export async function analyze(
  llm: LLMClient, question: string, ext: ExtractorOutput,
): Promise<AnalystOutput> {
  const user = `Вопрос: ${question}
data_sufficient: ${ext.data_sufficient}
Колонки: ${JSON.stringify(ext.columns)}
Строки (до 50): ${JSON.stringify(ext.rows.slice(0, 50))}
Заметки Extractor: ${ext.notes}`;
  return callJSON(llm, SYSTEM, user, AnalystOutputSchema);
}
