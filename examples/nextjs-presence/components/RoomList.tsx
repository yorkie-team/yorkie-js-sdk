'use client';

import Link from 'next/link';
import { usePeekChannel, useYorkie } from '@yorkie-js/react';
import Header from './Header';
import ServerError from './ServerError';
import { ROOMS, type Room } from '@/lib/rooms';

function RoomRow({ room }: { room: Room }) {
  // `usePeekChannel` reads a channel's session count without joining it, so
  // browsing the list does not add you to any room.
  const { sessionCount, loading, error } = usePeekChannel(room.key, {
    pollInterval: 5000,
  });

  return (
    <li>
      <Link className="room-row" href={{ query: { room: room.key } }}>
        <span className="room-text">
          <span className="room-name">{room.name}</span>
          <span className="room-description">{room.description}</span>
        </span>
        {!loading && !error && (
          <span className="room-count">{sessionCount} online</span>
        )}
        <svg
          className="chevron"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M6 3l5 5-5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </li>
  );
}

export default function RoomList() {
  const { loading, error } = useYorkie();

  return (
    <>
      <Header status={error ? 'error' : loading ? 'connecting' : 'connected'} />
      <main className="main">
        {error ? (
          <ServerError />
        ) : (
          <section className="card">
            <h2 className="card-title">Rooms</h2>
            <ul className="room-list">
              {ROOMS.map((room) => (
                <RoomRow key={room.key} room={room} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
