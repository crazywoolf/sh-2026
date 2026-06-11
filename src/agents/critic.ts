import { CriticOutputSchema, type CriticOutput, type AnalystOutput, type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — Critic системы Meridian. Проверь ответ аналитика по чек-листу ловушек:
1) orders и financials НЕ смешаны (P&L только из financials/unit_economics);
2) есть фильтр status там, где считается выручка;
3) нет усреднения разнородных групп без среза;
4) числа в ответе совпадают со строками данных (нет галлюцинаций);
5) если данных недостаточно — это честно отражено (а не выдуман ответ);
6) sunset-линия "Консалтинг" учтена осознанно.
Вердикт: "approved" | "revise" (target extractor|analyst + guidance) | "reject" (данных нет/ответ невозможен).
Верни JSON {verdict, checks:[{name,passed,comment}], issues[], target?, guidance?}.`;

export async function critique(
  llm: LLMClient, question: string, ext: ExtractorOutput, ana: AnalystOutput,
): Promise<CriticOutput> {
  const user = `Вопрос: ${question}
SQL: ${ext.sql}
data_sufficient: ${ext.data_sufficient}
Строки (до 50): ${JSON.stringify(ext.rows.slice(0, 50))}
Ответ аналитика: ${ana.answer}
Метод: ${ana.method}`;
  return callJSON(llm, SYSTEM, user, CriticOutputSchema);
}
