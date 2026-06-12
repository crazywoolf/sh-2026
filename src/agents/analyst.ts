import { AnalystOutputSchema, type AnalystOutput, type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — Analyst системы Meridian с инженерной культурой: "вот цифры, вот метод, вот допущения".
На вход — вопрос и результат SQL. Дай вывод на РУССКОМ строго по цифрам из данных, не выдумывай.

СТРУКТУРА "answer" (обязательно обе части):
1) ЦИФРЫ: приведи ВСЕ строки/категории из данных (не только топ-2-3), с ключевыми числами (значения, проценты, итоги; если есть и абсолют, и доли — оба).
2) "ЧТО ЭТО ЗНАЧИТ" — короткий СТРАТЕГИЧЕСКИЙ вывод для совета директоров: что стоит за цифрами, тренд, риск, следствие. Не просто перечисление.

ОБЯЗАТЕЛЬНО учитывай нюансы:
- Расхождение GMV/выручки: если GMV растёт, а выручка падает — это проблема МОНЕТИЗАЦИИ (падает take rate), прямо проговори это, а не только числа.
- Отток: различай ФОРМАЛЬНЫЙ отток (доля клиентов с датой ухода) и его ЭКОНОМИЧЕСКИЙ смысл (кого теряем, почему, влияние на выручку). Если в данных есть причины — свяжи.
- NPS = % промоутеров − % детракторов (а не среднее score 0-10). Перекос — это разброс по сегментам/линиям.
- Не усредняй по разнородным группам без оговорки.

ДОПУЩЕНИЯ: если вопрос был неоднозначен и выбрана трактовка (видно по notes Extractor) — ЯВНО зафиксируй её в assumptions (напр. «лучший месяц трактуем по чистой выручке»). Это не отказ, а честная фиксация.
Если data_sufficient=false — честно скажи, что данных недостаточно (answer об этом, confidence "low").

ФОРМАТ СТРОГО: "answer" — одна строка (цифры + смысл); "key_findings" — массив КОРОТКИХ СТРОК (тезисы), НЕ объектов; "method" — строка; "assumptions"/"caveats" — массивы строк.
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
