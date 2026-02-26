import { describe, it, expect, vi } from 'vitest';
import { BotService } from './BotService';

describe('BotService', () => {
  it('can be instantiated', () => {
    const mockIo = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;
    const mockSession = {} as any;
    const svc = new BotService(mockIo, mockSession);
    expect(svc).toBeDefined();
  });

  it('notifyBotTurn resolves without throwing for unknown session', async () => {
    const mockIo = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } as any;
    const mockSessionService = {
      getSession: vi.fn().mockResolvedValue(null),
    } as any;
    const svc = new BotService(mockIo, mockSessionService);
    await expect(svc.notifyBotTurn('BADCODE', 'botid')).resolves.not.toThrow();
  });
});
