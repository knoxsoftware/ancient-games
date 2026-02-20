import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/Home';
import SessionLobby from './components/lobby/SessionLobby';
import GameRoom from './components/GameRoom';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/session/:sessionCode" element={<SessionLobby />} />
          <Route path="/game/:sessionCode" element={<GameRoom />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
