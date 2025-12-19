'use client';

import { useEffect, useState } from 'react';
import { YorkieProvider } from '@yorkie-js/react';
import RoomSelector from '@/components/RoomSelector';
import RoomView from '@/components/RoomView';
import { ROOMS } from '@/lib/rooms';
import './App.css';

function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [sessions, setSessions] = useState<
    { key: string; sessionCount: number }[]
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
        const roomSessions = ROOMS.map((room) => {
          const sessionCount =
            data.channels?.find((ch) => ch.key === room.key)?.sessionCount ??
            0;
          return {
            key: room.key,
            sessionCount: sessionCount,
          };
        });

        const roomChannel = data.channels?.find((ch) => ch.key === 'room');
        const totalSession = {
          key: 'room',
          sessionCount: roomChannel?.sessionCount ?? 0,
        };

        setSessions([totalSession, ...roomSessions]);
      } catch (error) {
        console.error('Failed to fetch channels:', error);
        // Fallback to zero presence counts on error (e.g., static hosting mode)
        const fallbackSessions = ROOMS.map((room) => ({
          key: room.key,
          sessionCount: 0,
        }));
        setSessions(fallbackSessions);
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
            <RoomSelector onRoomSelect={setCurrentRoom} sessions={sessions} />
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
