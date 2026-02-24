import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './components/Home';
import SessionLobby from './components/lobby/SessionLobby';
import GameRoom from './components/GameRoom';
import { ThemeProvider } from './contexts/ThemeContext';
import ThemeToggle from './components/ThemeToggle';

function AppShell() {
  const location = useLocation();
  const isGameRoom = location.pathname.startsWith('/game/');

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* Fixed toggle on all pages except GameRoom (GameRoom has it inline) */}
      {!isGameRoom && <ThemeToggle fixed />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session/:sessionCode" element={<SessionLobby />} />
        <Route path="/game/:sessionCode" element={<GameRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
