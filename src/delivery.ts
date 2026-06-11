import type { Report } from "./report.ts";

export class Inbox {
  private items: Report[] = [];
  add(r: Report): void { this.items.unshift(r); }
  list(): Report[] { return this.items; }
}

function reportToText(r: Report): string {
  const head = `📊 Дашборд здоровья Meridian — ${r.generatedAt}`;
  const body = r.items.map((i) => `• ${i.title}: ${i.response.slice(0, 200)}`).join("\n");
  return `${head}\n${body}`;
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
        body: JSON.stringify({ chat_id: opts.telegram.chatId, text: reportToText(report) }),
      });
    } catch { /* не критично */ }
  }
}
