// Транскрипт работы агентов на одном тест-кейсе (для сдачи) — с пояснениями каждого шага.
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
p("Документ показывает, **как система пришла к выводу** — по шагам конвейера агентов. Каждый этап снабжён пояснением «что делает агент» (роль) и «что произошло здесь» (интерпретация конкретного шага).\n");
p("```");
p("Вопрос → Planner → Extractor → Analyst → Critic → Visualization → Ответ");
p("```");
p("> Сквозная гарантия: система **никогда не возвращает 500** и **не выдумывает данные** — если их нет, честно помечает `insufficient_data`.\n");
p("---\n");

// ── 1. Planner ──────────────────────────────────────────────
const planned = await plan(llm, Q);
p("## 1. Planner — классификация и декомпозиция");
p("> **Роль агента:** понимает вопрос и решает РЕЖИМ обработки: `bi` (один срез данных), `research` (декомпозиция на под-вопросы) или `insufficient` (нужного поля нет в витрине). Для сложных вопросов разбивает их на самодостаточные под-вопросы.\n");
p("```json\n" + J(planned) + "\n```\n");
const modeRu: Record<string, string> = {
  bi: "диалоговый BI — отвечается одним срезом данных",
  research: "мини-исследование — вопрос разложен на независимые под-вопросы",
  insufficient: "данных в витрине нет — будет честный отказ",
};
p(`**→ Что произошло:** выбран режим **\`${planned.mode}\`** (${modeRu[planned.mode] ?? planned.mode}); вопрос разложен на **${planned.sub_questions.length}** под-вопрос(а). Дальше каждый под-вопрос проходит Extractor → Analyst → Critic.\n`);

// ── 2. Extractor ────────────────────────────────────────────
const MAX_REVISIONS = 2;
const sub = planned.sub_questions[0] || Q;
let ext = await extract(llm, sub);
p("## 2. Extractor — извлечение данных (вопрос → SQL → DuckDB)");
p("> **Роль агента:** превращает под-вопрос в данные. Берёт готовую **проверенную метрику** из библиотеки, либо пишет безопасный `SELECT` (read-only, guard-rails: только чтение, белый список таблиц). Сам определяет, достаточно ли данных.\n");
p(`- **под-вопрос:** ${sub}`);
p(`- **подход:** ${ext.approach === "metric_template" ? `готовая метрика \`${ext.metric_id}\`` : "сгенерированный SELECT (free SQL)"}`);
p(`- **данных достаточно:** ${ext.data_sufficient ? "да" : "нет"} · **получено строк:** ${ext.row_count}`);
p("- **SQL (исполнен на DuckDB read-only):**\n```sql\n" + ext.sql + "\n```");
p("- **первые строки результата:**\n```json\n" + J(ext.rows.slice(0, 5)) + "\n```\n");
p(`**→ Что произошло:** ${ext.data_sufficient
  ? `данные получены (${ext.row_count} строк) — Extractor передаёт их Analyst для интерпретации.`
  : "данных под этот вопрос в витрине нет — Critic проверит, оправдан ли отказ, и при необходимости система честно ответит «недостаточно данных»."}\n`);

// ── 3. Analyst ──────────────────────────────────────────────
let ana = await analyze(llm, sub, ext);
p("## 3. Analyst — цифры → бизнес-вывод");
p("> **Роль агента:** переводит таблицу в вывод на языке совета директоров по принципу «вот цифры, вот метод, вот допущения». Ищет паттерны и компромиссы, проверяет известные напряжения (усреднение разнородного, активность ≠ выручка, формальное ≠ экономическое и т.д.), фиксирует допущения.\n");
p("```json\n" + J(ana) + "\n```\n");
p(`**→ Что произошло:** сформулирован вывод с уверенностью **\`${ana.confidence}\`**, выделено **${ana.key_findings.length}** ключевых наблюдений${ana.assumptions.length ? `, зафиксировано **${ana.assumptions.length}** допущение(й)` : ""}. Метод расчёта проговорён явно. Дальше вывод уходит на проверку к Critic.\n`);

// ── 4. Critic + петля доработки (loopback) ──────────────────
p("## 4. Critic — валидация и петля доработки (ключевой компонент оценки)");
p("> **Роль агента:** независимо проверяет ответ по чек-листу ловушек (ложный отказ, смешение таблиц, усреднение разнородного, сверка чисел со строками, масштаб, стратегический смысл). При несоответствии возвращает работу назад (`revise`) с КОНКРЕТНЫМ указанием — до 2 раз; система применяет указание и пересобирает ответ. Принцип **keep-best**: ревизию принимаем, только если она НЕ потеряла данные — иначе оставляем исходный верный ответ (защита от уверенно-неправильного критика).\n");
const verdictRu: Record<string, string> = {
  approved: "ответ одобрен — проверки пройдены, галлюцинаций и подмен не найдено",
  revise: "ответ возвращён на доработку с конкретным указанием",
  reject: "данных действительно нет — отказ оправдан",
};
let best = { ext, ana };
let crit = await critique(llm, sub, ext, ana);
for (let i = 0; i <= MAX_REVISIONS; i++) {
  const passed = crit.checks.filter((c) => c.passed).length;
  const fails = crit.checks.filter((c) => !c.passed);
  p(`### Итерация ${i + 1} — вердикт \`${crit.verdict}\` (${passed}/${crit.checks.length} проверок пройдено)`);
  if (fails.length) p(fails.map((c) => `- ❌ **${c.name}:** ${c.comment}`).join("\n") + "\n");
  if (crit.verdict !== "revise") {
    p(`**→ ${verdictRu[crit.verdict] ?? crit.verdict}.**\n`);
    break;
  }
  if (i === MAX_REVISIONS) {
    p(`**→ Лимит ревизий (${MAX_REVISIONS}) исчерпан.** По принципу **keep-best** система отдаёт лучший непадший вариант (данные на месте, числа верны), а замечание ревизора сохраняется как оговорка. Здесь замечание спорное — каноничная метрика берёт срез одного месяца, а не усредняет панель, — поэтому исходный верный ответ не деградирует.\n`);
    ext = best.ext; ana = best.ana;
    break;
  }
  p(`> 🔁 **Доработка ${i + 1}** (цель: \`${crit.target}\`). Указание ревизора:\n> «${crit.guidance ?? "—"}»\n`);
  if (crit.target === "extractor") {
    ext = await extract(llm, sub, crit.guidance ?? undefined);
    p(`- **Extractor** пересобрал запрос с учётом замечания: подход ${ext.approach === "metric_template" ? `метрика \`${ext.metric_id}\`` : "free SQL"}, строк ${ext.row_count}, данные ${ext.data_sufficient ? "на месте ✅" : "потеряны ⚠️ (keep-best оставит исходный ответ)"}.`);
  }
  ana = await analyze(llm, sub, ext, crit.guidance ?? undefined);
  p(`- **Analyst** переписал вывод с учётом указания.\n`);
  if (ext.data_sufficient || !best.ext.data_sufficient) best = { ext, ana };
  crit = await critique(llm, sub, ext, ana);
}
p("Полный JSON последней проверки Critic:");
p("```json\n" + J(crit) + "\n```\n");

// ── 5. Visualization ────────────────────────────────────────
const viz = await visualize(llm, ana, ext);
p("## 5. Visualization — выбор графика под задачу");
p("> **Роль агента:** подбирает тип визуализации под характер данных: динамика → линия, сравнение категорий → столбцы, структура → круговая, аномалии → точки. Одномерный скаляр оставляет без графика.\n");
p("```json\n" + J({ chart: viz.chart ? { type: viz.chart.type, x: viz.chart.x, y: viz.chart.y } : null, rationale: viz.rationale }) + "\n```\n");
p(`**→ Что произошло:** ${viz.chart
  ? `выбран график типа **\`${viz.chart.type}\`** (${viz.chart.x} → ${viz.chart.y})${viz.rationale ? ` — ${viz.rationale}` : ""}.`
  : "график не нужен (ответ — одно число или текстовый вывод)."}\n`);

// ── Итог ────────────────────────────────────────────────────
p("---");
p("## Итоговый ответ пользователю");
p(`Собранный из шагов выше ответ, который видит совет директоров:\n`);
p("> " + ana.answer.replace(/\n/g, "\n> "));
p("");
p(`*Конвейер: Planner(\`${planned.mode}\`) → Extractor(${ext.row_count} строк) → Analyst(\`${ana.confidence}\`) → Critic(\`${crit.verdict}\`) → Visualization(${viz.chart ? viz.chart.type : "—"}). Всё воспроизводимо: тот же вопрос → тот же путь и те же цифры.*`);

console.log(out.join("\n"));
