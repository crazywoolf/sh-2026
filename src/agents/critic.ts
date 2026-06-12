import { CriticOutputSchema, type CriticOutput, type AnalystOutput, type ExtractorOutput } from "../contracts/types.ts";
import { callJSON } from "../llm/json.ts";
import type { LLMClient } from "../llm/client.ts";

const SYSTEM = `Ты — Critic системы Meridian. Проверь ответ аналитика по чек-листу:
1) 🔴 ЛОЖНЫЙ ОТКАЗ: если ответ — «данных недостаточно», но вопрос НА САМОМ ДЕЛЕ отвечается из витрины (GMV/выручка/take_rate — в financials_monthly; NPS — в nps_responses; отток — в churn_reasons/customers; и т.д.) — это ОШИБКА. verdict="revise", target="extractor", guidance: какую таблицу/поле использовать. Отказ оправдан ТОЛЬКО если нужного поля реально нет (прибыль по заказу, прогноз будущего, пол клиента).
2) orders и financials не смешаны В ОДНОМ запросе (но расхождение GMV/выручки из financials_monthly — это норм, там есть оба поля);
3) есть фильтр status там, где считается выручка по orders;
4) нет усреднения разнородных групп без оговорки;
5) числа в ответе совпадают со строками данных (нет галлюцинаций);
6) NPS считается как %промо−%детракт, а не среднее score;
7) если вопрос был неоднозначен — выбрана трактовка и зафиксирована допущением (это правильно, НЕ повод для reject);
8) есть ли в ответе стратегический смысл, а не только числа (если нет — revise→analyst);
9) 🔴 МАСШТАБ ЧИСЕЛ: размер базы — ~25 000 клиентов и ~681 000 заказов. Если в ответе «количество клиентов» (отток, спящие, по сегментам) в сотнях тысяч или миллионах — это ошибочный JOIN с помесячной панелью (unit_economics_monthly / customer_activity_monthly), числа РАЗДУТЫ в разы. verdict="revise", target="extractor", guidance: считать уникальных клиентов из customers/churn_reasons без JOIN с месячными таблицами.
Вердикт: "approved" | "revise" (target extractor|analyst + guidance) | "reject" (ТОЛЬКО если нужных данных реально нет).
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
