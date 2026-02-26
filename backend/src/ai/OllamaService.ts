interface CommentContext {
  persona: string;
  gameName: string;
  moveDescription: string;
  boardSummary: string;
}

export class OllamaService {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = 'http://localhost:11434', model = 'llama3.2:1b') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  /** Load the model into memory and keep it resident for 1 hour. Fire-and-forget at startup. */
  async warmUp(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: '', keep_alive: '1h', stream: false }),
      });
    } catch {
      // Ollama not reachable yet — that's fine
    }
  }

  async generateComment(ctx: CommentContext): Promise<string> {
    const prompt = `You are ${ctx.persona}, an ancient game master playing ${ctx.gameName}.
You just made this move: ${ctx.moveDescription}.
Board state: ${ctx.boardSummary}.
React in 1-2 sentences, in character. Be terse and confident. No quotes.`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, stream: false }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) return '';
      const data = (await response.json()) as { response?: string };
      return (data.response ?? '').trim();
    } catch {
      return '';
    }
  }
}
