import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { GameType } from '@ancient-games/shared';

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'create' | 'join' | null>(null);
  const [gameType, setGameType] = useState<GameType>('ur');
  const [displayName, setDisplayName] = useState(localStorage.getItem('playerName') ?? '');
  const [sessionCode, setSessionCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateSession = async () => {
    if (!displayName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.createSession({ gameType, displayName: displayName.trim() });
      localStorage.setItem('playerId', result.playerId);
      localStorage.setItem('playerName', displayName.trim());
      navigate(`/session/${result.session.sessionCode}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async () => {
    if (!displayName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!sessionCode.trim()) {
      setError('Please enter session code');
      return;
    }

    setLoading(true);
    setError('');

    const code = sessionCode.trim().toUpperCase();
    try {
      const result = await api.joinSession({
        sessionCode: code,
        displayName: displayName.trim(),
      });
      localStorage.setItem('playerId', result.playerId);
      localStorage.setItem('playerName', displayName.trim());
      navigate(`/session/${result.session.sessionCode}`);
    } catch (err) {
      if ((err as Error).message === 'Session has already started') {
        navigate(`/game/${code}`);
        return;
      }
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">
            Ancient Games
          </h1>
          <p className="text-gray-400 text-lg">
            Play ancient board games online with friends
          </p>
        </div>

        {!mode ? (
          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('create')}
              className="card hover:border-primary-500 transition-all p-8 cursor-pointer group"
            >
              <div className="text-4xl mb-4">🎲</div>
              <h2 className="text-2xl font-bold mb-2 group-hover:text-primary-400 transition-colors">
                Create Game
              </h2>
              <p className="text-gray-400">Start a new game session</p>
            </button>

            <button
              onClick={() => setMode('join')}
              className="card hover:border-secondary-500 transition-all p-8 cursor-pointer group"
            >
              <div className="text-4xl mb-4">🎯</div>
              <h2 className="text-2xl font-bold mb-2 group-hover:text-secondary-400 transition-colors">
                Join Game
              </h2>
              <p className="text-gray-400">Enter a session code</p>
            </button>
          </div>
        ) : (
          <div className="card">
            <button
              onClick={() => {
                setMode(null);
                setError('');
              }}
              className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
            >
              ← Back
            </button>

            {mode === 'create' && (
              <>
                <h2 className="text-2xl font-bold mb-6">Create New Game</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Your Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateSession()}
                      placeholder="Enter your name"
                      className="input w-full"
                      maxLength={20}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Choose Game</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setGameType('ur')}
                        className={`p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                          gameType === 'ur'
                            ? 'border-primary-500 bg-primary-500/20'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl mb-2">🏛️</div>
                        <div className="font-semibold text-sm">Royal Game of Ur</div>
                        <div className="text-xs text-gray-400 mt-1">2 players</div>
                      </button>

                      <button
                        onClick={() => setGameType('senet')}
                        className={`p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                          gameType === 'senet'
                            ? 'border-primary-500 bg-primary-500/20'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl mb-2">🏺</div>
                        <div className="font-semibold text-sm">Senet</div>
                        <div className="text-xs text-gray-400 mt-1">2 players</div>
                      </button>

                      <button
                        onClick={() => setGameType('morris')}
                        className={`p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                          gameType === 'morris'
                            ? 'border-primary-500 bg-primary-500/20'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl mb-2">⬡</div>
                        <div className="font-semibold text-sm">Nine Men's Morris</div>
                        <div className="text-xs text-gray-400 mt-1">2 players</div>
                      </button>

                      <button
                        onClick={() => setGameType('wolves-and-ravens')}
                        className={`p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                          gameType === 'wolves-and-ravens'
                            ? 'border-primary-500 bg-primary-500/20'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl mb-2">🐺</div>
                        <div className="font-semibold text-sm">Wolves &amp; Ravens *</div>
                        <div className="text-xs text-gray-400 mt-1">Asymmetric hunt</div>
                      </button>

                      <button
                        onClick={() => setGameType('rock-paper-scissors')}
                        className={`p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                          gameType === 'rock-paper-scissors'
                            ? 'border-primary-500 bg-primary-500/20'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl mb-2">✂️</div>
                        <div className="font-semibold text-sm">Rock Paper Scissors</div>
                        <div className="text-xs text-gray-400 mt-1">Single battle</div>
                      </button>

                      <button
		        disabled
                        onClick={() => setGameType('stellar-siege')}
                        className={`p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                          gameType === 'stellar-siege'
                            ? 'border-primary-500 bg-primary-500/20'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl mb-2">🚀</div>
                        <div className="font-semibold text-sm">Stellar Siege (DISABLED)*</div>
                        <div className="text-xs text-gray-400 mt-1">Asymmetric defense (coming soon!)</div>
                      </button>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">* AI-generated game</div>
                  </div>

                  {error && (
                    <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-200">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleCreateSession}
                    disabled={loading}
                    className="btn btn-primary w-full text-lg py-3"
                  >
                    {loading ? 'Creating...' : 'Create Session'}
                  </button>
                </div>
              </>
            )}

            {mode === 'join' && (
              <>
                <h2 className="text-2xl font-bold mb-6">Join Game</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Your Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoinSession()}
                      placeholder="Enter your name"
                      className="input w-full"
                      maxLength={20}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Session Code</label>
                    <input
                      type="text"
                      value={sessionCode}
                      onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoinSession()}
                      placeholder="Enter 6-character code"
                      className="input w-full text-2xl tracking-wider text-center font-mono"
                      maxLength={6}
                    />
                  </div>

                  {error && (
                    <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-200">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleJoinSession}
                    disabled={loading}
                    className="btn btn-primary w-full text-lg py-3"
                  >
                    {loading ? 'Joining...' : 'Join Session'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="text-center mt-8">
          <a
            href="https://buymeacoffee.com/knoxsoftware"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-semibold transition-colors text-sm"
          >
            ☕ Buy me a coffee
          </a>
        </div>
      </div>
    </div>
  );
}
