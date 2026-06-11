import { z } from "zod";

export const UserQuerySchema = z.object({
  message: z.string(),
  session_id: z.string().optional(),
  prefer_research: z.boolean().optional(),
});
export type UserQuery = z.infer<typeof UserQuerySchema>;

export const PlannerOutputSchema = z.object({
  mode: z.enum(["bi", "research", "insufficient"]),
  reasoning: z.string(),
  sub_questions: z.array(z.string()),
});
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export const ColumnSchema = z.object({ name: z.string(), type: z.string() });

export const ExtractorOutputSchema = z.object({
  approach: z.enum(["metric_template", "free_sql"]),
  metric_id: z.string().optional(),
  sql: z.string(),
  columns: z.array(ColumnSchema),
  rows: z.array(z.record(z.unknown())),
  row_count: z.number(),
  data_sufficient: z.boolean(),
  notes: z.string(),
  assumptions: z.array(z.string()),
});
export type ExtractorOutput = z.infer<typeof ExtractorOutputSchema>;

// Коэрсинг к строке: LLM иногда кладёт в текстовые поля объекты/числа — не роняем парсинг.
const Stringy = z.unknown().transform((v) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v)));
// Список строк, устойчивый к null/одиночному значению/объектам внутри.
export const StringArray = z.preprocess(
  (v) => (Array.isArray(v) ? v : v == null ? [] : [v]),
  z.array(Stringy),
);

export const AnalystOutputSchema = z.object({
  answer: Stringy,
  key_findings: StringArray,
  method: Stringy,
  assumptions: StringArray,
  caveats: StringArray,
  confidence: z.enum(["high", "medium", "low"]).catch("medium"),
});
export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;

export const CriticOutputSchema = z.object({
  verdict: z.enum(["approved", "revise", "reject"]),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), comment: z.string() })),
  issues: z.array(z.string()),
  target: z.enum(["extractor", "analyst"]).nullish(),
  guidance: z.string().nullish(),
});
export type CriticOutput = z.infer<typeof CriticOutputSchema>;

export const ChartSchema = z.object({
  type: z.enum(["line", "bar", "grouped_bar", "pie", "table", "scatter"]),
  title: z.string(),
  x: z.string(),
  y: z.union([z.string(), z.array(z.string())]),
  series: z.string().nullish(),
  data: z.array(z.record(z.unknown())),
});

export const VizOutputSchema = z.object({
  chart: ChartSchema.nullable(),
  rationale: z.string(),
});
export type VizOutput = z.infer<typeof VizOutputSchema>;

export const TraceEntrySchema = z.object({
  agent: z.enum(["planner", "extractor", "analyst", "critic", "visualizer"]),
  sql: z.string().optional(),
  rows: z.number().optional(),
  verdict: z.string().optional(),
  note: z.string().optional(),
});
export type TraceEntry = z.infer<typeof TraceEntrySchema>;

export const PlanSummarySchema = z.object({
  mode: z.enum(["bi", "research", "insufficient"]),
  sub_questions: z.array(z.string()),
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;

export const FinalResponseSchema = z.object({
  response: z.string(),
  assumptions: z.array(z.string()),
  trace: z.array(TraceEntrySchema),
  chart: ChartSchema.nullable(),
  insufficient_data: z.boolean(),
  session_id: z.string(),
  plan: PlanSummarySchema.optional(),
  sub_answers: z.array(z.string()).optional(),
});
export type FinalResponse = z.infer<typeof FinalResponseSchema>;
