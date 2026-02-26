import { describe, it, expect } from 'vitest';
import { OllamaService } from './OllamaService';

describe('OllamaService', () => {
  it('returns empty string when Ollama is unreachable', async () => {
    const svc = new OllamaService('http://localhost:19999'); // bad port
    const result = await svc.generateComment({
      persona: 'Test Bot',
      gameName: 'Royal Game of Ur',
      moveDescription: 'moved piece from position 3 to position 7',
      boardSummary: '3 pieces on board',
    });
    expect(result).toBe('');
  });
});
