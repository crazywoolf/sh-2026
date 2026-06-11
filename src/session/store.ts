export type Turn = { question: string; answer: string };

export class SessionStore {
  private map = new Map<string, Turn[]>();
  constructor(private readonly limit = 5) {}

  get(sessionId: string): Turn[] {
    return this.map.get(sessionId) ?? [];
  }

  append(sessionId: string, question: string, answer: string): void {
    const turns = this.map.get(sessionId) ?? [];
    turns.push({ question, answer });
    while (turns.length > this.limit) turns.shift();
    this.map.set(sessionId, turns);
  }
}
