import type { FinalResponse, UserQuery } from "./contracts/types.ts";
import { PRESETS } from "./presets.ts";

export type ReportItem = {
  title: string;
  question: string;
  response: string;
  chart: FinalResponse["chart"];
  insufficient_data: boolean;
  alert: boolean;
};
export type Report = { generatedAt: string; items: ReportItem[]; recommendations?: string[] };

export type CompileOpts = { recommend?: (items: ReportItem[]) => Promise<string[]> };

export async function compileReport(
  pipeline: (q: UserQuery) => Promise<FinalResponse>,
  generatedAt: string,
  opts?: CompileOpts,
): Promise<Report> {
  const items: ReportItem[] = [];
  for (const p of PRESETS) {
    const r = await pipeline({ message: p.question });
    items.push({
      title: p.title, question: p.question, response: r.response,
      chart: r.chart, insufficient_data: r.insufficient_data, alert: p.alert ?? false,
    });
  }
  const recommendations = opts?.recommend ? await opts.recommend(items) : [];
  return { generatedAt, items, recommendations };
}
