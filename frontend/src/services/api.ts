import {
  CreateSessionRequest,
  CreateSessionResponse,
  JoinSessionRequest,
  JoinSessionResponse,
  SpectateSessionRequest,
  SpectateSessionResponse,
  Session,
} from '@ancient-games/shared';

const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

export const api = {
  async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    const response = await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create session');
    }

    return response.json();
  },

  async joinSession(request: JoinSessionRequest): Promise<JoinSessionResponse> {
    const response = await fetch(`${API_URL}/sessions/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to join session');
    }

    return response.json();
  },

  async spectateSession(request: SpectateSessionRequest): Promise<SpectateSessionResponse> {
    const response = await fetch(`${API_URL}/sessions/spectate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to join as spectator');
    }

    return response.json();
  },

  async getSession(sessionCode: string): Promise<Session> {
    const response = await fetch(`${API_URL}/sessions/${sessionCode}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get session');
    }

    return response.json();
  },
};
