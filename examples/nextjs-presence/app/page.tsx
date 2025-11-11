'use client';

import { useEffect, useState } from 'react';
import { YorkieProvider } from '@yorkie-js/react';
import RoomSelector from '@/components/RoomSelector';
import RoomView from '@/components/RoomView';
import { ROOMS } from '@/lib/rooms';
import './App.css';

function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [presences, setPresences] = useState<
    { key: string; presenceCount: number }[]
  >([]);

  useEffect(() => {
    if (currentRoom !== null) {
      return;
    }

    const fetchChannels = async () => {
      try {
        const response = await fetch('/api/channels', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel_keys: ['room', ...ROOMS.map((room) => room.key)],
            include_sub_path: true,
          }),
        });
        const data = await response.json();
        const roomPresences = ROOMS.map((room) => {
          const presenceCount =
            data.channels?.find((ch) => ch.key === room.key)?.presenceCount ??
            0;
          return {
            key: room.key,
            presenceCount: presenceCount,
          };
        });

        const roomChannel = data.channels?.find((ch) => ch.key === 'room');
        const totalPresence = {
          key: 'room',
          presenceCount: roomChannel?.presenceCount ?? 0,
        };

        setPresences([totalPresence, ...roomPresences]);
      } catch (error) {
        console.error('Failed to fetch channels:', error);
        // Fallback to zero presence counts on error (e.g., static hosting mode)
        const fallbackPresences = ROOMS.map((room) => ({
          key: room.key,
          presenceCount: 0,
        }));
        setPresences(fallbackPresences);
      }
    };

    fetchChannels();
  }, [currentRoom]);

  return (
    <YorkieProvider
      apiKey={process.env.NEXT_PUBLIC_YORKIE_API_KEY || ''}
      rpcAddr={
        process.env.NEXT_PUBLIC_YORKIE_API_ADDR || 'http://localhost:8080'
      }
    >
      <div className="app">
        <header className="app-header">
          <div className="app-header-title">
            <h1>Yorkie Presence Rooms</h1>
          </div>
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
