import type { Report } from "./report.ts";

export class Inbox {
  private items: Report[] = [];
  add(r: Report): void { this.items.unshift(r); }
  list(): Report[] { return this.items; }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Чистая обрезка: по границе предложения, иначе по слову, с многоточием.
function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= n) return one;
  const cut = one.slice(0, n);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentenceEnd > n * 0.5) return cut.slice(0, sentenceEnd + 1);
  return cut.replace(/\s+\S*$/, "") + "…";
}

// HTML-форматирование отчёта для Telegram (parse_mode=HTML).
export function reportToText(r: Report): string {
  const lines: string[] = [
    "📊 <b>Дашборд здоровья Meridian</b>",
    `<i>${escapeHtml(formatDate(r.generatedAt))}</i>`,
    "",
  ];
  for (const i of r.items) {
    const mark = i.insufficient_data ? "❔" : i.alert ? "⚠️" : "✅";
    lines.push(`${mark} <b>${escapeHtml(i.title)}</b>`);
    lines.push(escapeHtml(clip(i.response, 240)));
    lines.push("");
  }
  lines.push("<i>Автоотчёт Meridian · собран по расписанию</i>");
  return lines.join("\n");
}

export type DeliverOpts = {
  inbox: Inbox;
  webhookUrl?: string;
  telegram?: { token: string; chatId: string };
  fetchFn?: typeof fetch;
};

export async function deliver(report: Report, opts: DeliverOpts): Promise<void> {
  opts.inbox.add(report);
  const doFetch = opts.fetchFn ?? fetch;
  if (opts.webhookUrl) {
    try {
      await doFetch(opts.webhookUrl, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report),
      });
    } catch { /* доставка не критична — отчёт уже в инбоксе */ }
  }
  if (opts.telegram) {
    try {
      const url = `https://api.telegram.org/bot${opts.telegram.token}/sendMessage`;
      await doFetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: opts.telegram.chatId, text: reportToText(report),
          parse_mode: "HTML", disable_web_page_preview: true,
        }),
      });
    } catch { /* не критично */ }
  }
}
