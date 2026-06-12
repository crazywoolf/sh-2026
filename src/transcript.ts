// Транскрипт работы агентов на одном тест-кейсе (для сдачи).
// Запуск: node --env-file=.env --import tsx src/transcript.ts "вопрос" > docs/transcript.md
import { createLLMClient } from "./llm/client.ts";
import { plan } from "./agents/planner.ts";
import { extract } from "./agents/extractor.ts";
import { analyze } from "./agents/analyst.ts";
import { critique } from "./agents/critic.ts";
import { visualize } from "./agents/visualizer.ts";

const llm = createLLMClient();
const Q = process.argv[2] || "Какое отношение LTV/CAC по сегментам? Где привлечение убыточно?";
const J = (x: unknown) => JSON.stringify(x, null, 2);
const out: string[] = [];
const p = (s: string) => out.push(s);

p("# Транскрипт работы агентов Meridian\n");
p(`**Тест-кейс (вопрос):** ${Q}\n`);
p("Видно, как система пришла к выводу: Planner → Extractor → Analyst → Critic → Visualization.\n");

const planned = await plan(llm, Q);
p("## 1. Planner — классификация и декомпозиция");
p("```json\n" + J(planned) + "\n```\n");

const sub = planned.sub_questions[0] || Q;
const ext = await extract(llm, sub);
p("## 2. Extractor — извлечение данных");
p(`- **под-вопрос:** ${sub}`);
p(`- **approach:** ${ext.approach}${ext.metric_id ? ` (метрика ${ext.metric_id})` : ""}`);
p(`- **data_sufficient:** ${ext.data_sufficient} · **строк:** ${ext.row_count}`);
p("- **SQL (исполнен на DuckDB read-only):**\n```sql\n" + ext.sql + "\n```");
p("- **первые строки результата:**\n```json\n" + J(ext.rows.slice(0, 5)) + "\n```\n");

const ana = await analyze(llm, sub, ext);
p("## 3. Analyst — цифры → бизнес-вывод");
p("```json\n" + J(ana) + "\n```\n");

const crit = await critique(llm, sub, ext, ana);
p("## 4. Critic — валидация (чек-лист ловушек)");
p("```json\n" + J(crit) + "\n```\n");

const viz = await visualize(llm, ana, ext);
p("## 5. Visualization — выбор графика");
p("```json\n" + J({ chart: viz.chart ? { type: viz.chart.type, x: viz.chart.x, y: viz.chart.y } : null, rationale: viz.rationale }) + "\n```\n");

p("---");
p(`**Итог:** ${ana.answer.slice(0, 300)}`);

console.log(out.join("\n"));
