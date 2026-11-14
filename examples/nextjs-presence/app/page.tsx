'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { YorkieProvider } from '@yorkie-js/react';
import RoomList from '@/components/RoomList';
import RoomView from '@/components/RoomView';
import { API_ADDR, ROOMS } from '@/lib/rooms';

function App() {
  // The current room lives in the URL (`?room=<key>`), so opening this page
  // in another tab lands in the same room.
  const roomKey = useSearchParams().get('room');
  const room = ROOMS.find((r) => r.key === roomKey);

  return room ? <RoomView key={room.key} room={room} /> : <RoomList />;
}

export default function Page() {
  return (
    <YorkieProvider
      apiKey={process.env.NEXT_PUBLIC_YORKIE_API_KEY || ''}
      rpcAddr={API_ADDR}
    >
      {/* `useSearchParams` needs a Suspense boundary in a static export. */}
      <Suspense>
        <App />
      </Suspense>
    </YorkieProvider>
  );
}
