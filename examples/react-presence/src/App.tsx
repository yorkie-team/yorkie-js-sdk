import { useState } from 'react';
import { YorkieProvider } from '@yorkie-js/react';
import RoomSelector from './components/RoomSelector';
import RoomView from './components/RoomView';
import './App.css';

// Available rooms with their metadata
export const ROOMS = [
  { id: 'general', name: '💬 General', description: 'General discussion' },
  { id: 'dev', name: '💻 Development', description: 'Tech talk and coding' },
  { id: 'random', name: '🎲 Random', description: 'Off-topic chat' },
  { id: 'music', name: '🎵 Music', description: 'Share your favorite tunes' },
];

function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  return (
    <YorkieProvider
      apiKey={import.meta.env.VITE_YORKIE_API_KEY || ''}
      rpcAddr={import.meta.env.VITE_YORKIE_API_ADDR || 'http://localhost:8080'}
    >
      <div className="app">
        <header className="app-header">
          <h1>Yorkie Presence Rooms</h1>
          <p>Real-time user presence tracking across multiple rooms</p>
        </header>

        <main className="app-main">
          {currentRoom ? (
            <RoomView
              roomId={currentRoom}
              onLeave={() => setCurrentRoom(null)}
            />
          ) : (
            <RoomSelector onRoomSelect={setCurrentRoom} />
          )}
        </main>

        <footer className="app-footer">
          <p>
            Open multiple browser windows to see real-time presence updates! •{' '}
            <a
              href="https://github.com/yorkie-team/yorkie-js-sdk"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </p>
        </footer>
      </div>
    </YorkieProvider>
  );
}

export default App;
