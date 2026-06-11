import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const DB_PATH = process.env.MERIDIAN_DB ?? "db/meridian.duckdb";
export const ALLOWED_TABLES = [
  "customers", "orders", "product_lines", "nps_responses",
  "customer_activity_monthly", "churn_reasons", "financials_monthly",
  "unit_economics_monthly",
];
const FORBIDDEN = /\b(insert|update|delete|drop|create|alter|attach|copy|install|load|pragma|export|replace)\b/i;
const FORBIDDEN_OBJ = /(^|[^a-z_])_[a-z]|read_csv|read_parquet|glob/i;

export class GuardError extends Error {}

export type QueryResult = { rows: Record<string, unknown>[]; columns: string[] };

function guard(sql: string): string {
  const s = sql.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(s)) throw new GuardError("разрешён только SELECT/WITH");
  if (FORBIDDEN.test(s)) throw new GuardError("запрещённая операция в SQL");
  if (FORBIDDEN_OBJ.test(s)) throw new GuardError("обращение к запрещённым объектам");
  if (s.includes(";")) throw new GuardError("несколько стейтментов запрещено");
  return s;
}

export async function runSelect(sql: string, cap = 1000): Promise<QueryResult> {
  const safe = guard(sql);
  const wrapped = `SELECT * FROM ( ${safe} ) AS _q LIMIT ${cap}`;
  const { stdout } = await execFileP(
    "duckdb",
    ["-readonly", DB_PATH, "-json", "-c", wrapped],
    { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 },
  );
  const rows = (JSON.parse(stdout || "[]")) as Record<string, unknown>[];
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { rows, columns };
}
