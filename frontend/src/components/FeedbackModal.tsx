import { useState } from 'react';

const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

interface FeedbackModalProps {
  gameType?: string;
  sessionCode?: string;
  playerName?: string;
  onClose: () => void;
}

export default function FeedbackModal({
  gameType,
  sessionCode,
  playerName,
  onClose,
}: FeedbackModalProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, gameType, sessionCode, playerName }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit feedback');
      }
      setSubmitted(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl p-6"
        style={{ background: '#1A1008', border: '1px solid rgba(196,160,48,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
          style={{
            background: 'rgba(80,60,30,0.5)',
            color: '#E8C870',
            border: '1px solid rgba(196,160,48,0.25)',
          }}
          title="Close"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold mb-1" style={{ color: '#E8C870' }}>
          Share Feedback
        </h2>
        <p className="text-sm mb-4" style={{ color: 'rgba(196,168,107,0.6)' }}>
          Tell us what you think — bugs, ideas, anything.
        </p>

        {submitted ? (
          <p className="text-center py-4" style={{ color: '#C4A030' }}>
            Thanks for the feedback!
          </p>
        ) : (
          <>
            <textarea
              className="w-full rounded-lg p-3 text-sm resize-none mb-3 outline-none"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(196,160,48,0.25)',
                color: '#F0E6C8',
                minHeight: '120px',
              }}
              placeholder="Your feedback…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            {error && (
              <p className="text-sm mb-3" style={{ color: '#F87171' }}>
                {error}
              </p>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting || !text.trim()}
              className="w-full py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{
                background: 'rgba(196,160,48,0.2)',
                border: '1px solid rgba(196,160,48,0.5)',
                color: '#E8C870',
              }}
            >
              {submitting ? 'Sending…' : 'Submit'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
