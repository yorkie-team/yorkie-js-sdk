'use client';

import { useEffect, useState } from 'react';
import { YorkieProvider } from '@yorkie-js/react';
import RoomSelector from '@/components/RoomSelector';
import RoomView from '@/components/RoomView';
import { ROOMS, ROOM_CATEGORIES } from '@/lib/rooms';
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
        const categoryKeys = ROOM_CATEGORIES.map((category) => category.id);
        const response = await fetch('/api/channels', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel_keys: [...categoryKeys, ...ROOMS.map((room) => room.key)],
            include_sub_path: true,
          }),
        });
        const data = await response.json();
        const roomSessions = ROOMS.map((room) => {
          const roomSessionCount =
            data.channels?.find((ch) => ch.key === room.key)?.sessionCount ??
            0;
          return {
            key: room.key,
            sessionCount: roomSessionCount,
          };
        });

        const categorySessions = ROOM_CATEGORIES.map((category) => {
          const categoryKey = `${category.id}`;
          const categorySessionCount =
            data.channels?.find((ch) => ch.key === categoryKey)
              ?.sessionCount ?? 0;
          return {
            key: categoryKey,
            sessionCount: categorySessionCount,
          };
        });

        // Calculate total from all category sessionCounts
        const totalSessionCount = categorySessions.reduce(
          (acc, cat) => acc + cat.sessionCount,
          0,
        );
        const totalSession = {
          key: 'total',
          sessionCount: totalSessionCount,
        };

        setSessions([totalSession, ...categorySessions, ...roomSessions]);
      } catch (error) {
        console.error('Failed to fetch channels:', error);
        // Fallback to zero presence counts on error (e.g., static hosting mode)
        const fallbackSessions = ROOMS.map((room) => ({
          key: room.key,
          sessionCount: 0,
        }));
        const fallbackCategorySessions = ROOM_CATEGORIES.map((category) => ({
          key: category.id,
          sessionCount: 0,
        }));
        const fallbackTotal = {
          key: 'total',
          sessionCount: 0,
        };
        setSessions([
          fallbackTotal,
          ...fallbackCategorySessions,
          ...fallbackSessions,
        ]);
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
