interface CommentContext {
  persona: string;
  gameName: string;
  moveDescription: string;
  boardSummary: string;
}

interface IntroContext {
  persona: string;
  gameName: string;
  opponentName: string;
}

interface OutroContext {
  persona: string;
  gameName: string;
  opponentName: string;
  won: boolean;
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

  async generateIntro(ctx: IntroContext): Promise<string> {
    const prompt = `You are ${ctx.persona}, an ancient game master. You are about to play ${ctx.gameName} against ${ctx.opponentName}.
Give a short opening remark in character — a greeting, boast, or challenge. 1-2 sentences. No quotes.`;
    return this.callOllama(prompt);
  }

  async generateOutro(ctx: OutroContext): Promise<string> {
    const outcome = ctx.won ? 'You won the game.' : 'You lost the game.';
    const prompt = `You are ${ctx.persona}, an ancient game master who just finished playing ${ctx.gameName} against ${ctx.opponentName}. ${outcome}
React in character — congratulate, lament, or show sportsmanship. 1-2 sentences. No quotes.`;
    return this.callOllama(prompt);
  }

  async generateComment(ctx: CommentContext): Promise<string> {
    const prompt = `You are ${ctx.persona}, an ancient game master playing ${ctx.gameName}.
You just made this move: ${ctx.moveDescription}.
Board state: ${ctx.boardSummary}.
React in a single sentence or even a sentence fragment, in character. Be terse and confident. No quotes. Do not mention position numbers, only vague descriptions of the location on the board you are referring to.`;
    return this.callOllama(prompt);
  }

  private async callOllama(prompt: string): Promise<string> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

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
