import { useEffect, useState } from 'react';
import { YorkieProvider } from '@yorkie-js/react';
import RoomSelector from './components/RoomSelector';
import RoomView from './components/RoomView';
import './App.css';

// Available rooms with their metadata
export const ROOMS = [
  { id: 'general', name: '💬 General', description: 'General discussion', key: "room-general" },
  { id: 'dev', name: '💻 Development', description: 'Tech talk and coding', key: "room-dev" },
  { id: 'random', name: '🎲 Random', description: 'Off-topic chat', key: "room-random" },
  { id: 'music', name: '🎵 Music', description: 'Share your favorite tunes', key: "room-music" },
];

function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const url = `${import.meta.env.VITE_YORKIE_API_ADDR}/yorkie.v1.AdminService/GetChannels`;
  const [presences, setPresences] = useState<{ key: string, presenceCount: number }[]>([]);
  
  useEffect(() => {
    // RoomSelector가 보일 때만 (currentRoom이 null일 때) fetchChannels 실행
    if (currentRoom !== null) {
      return;
    }

    const fetchChannels = async () => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
            Authorization: `API-Key ${import.meta.env.VITE_YORKIE_API_SECRET_KEY}`,
          },
          body: JSON.stringify({
            channel_keys: ROOMS.map(room => room.key),
            include_presence: false,
          }),
        });
        const data = await response.json();
        const newPresences = ROOMS.map(room => {
          const presenceCount = data.channels?.find((ch: any) => ch.key === room.key)?.presenceCount ?? 0;
          return {
            key: room.key,
            presenceCount: presenceCount,
          };
        });
        
        setPresences(newPresences);
      } catch (error) {
        console.error('Failed to fetch channels:', error);
      }
    };
    
    fetchChannels();
  }, [currentRoom, url]);
  
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
            <RoomSelector onRoomSelect={setCurrentRoom} presences={presences} />
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
