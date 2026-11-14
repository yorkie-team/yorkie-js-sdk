'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChannelProvider, useChannel } from '@yorkie-js/react';
import Header from './Header';
import ServerError from './ServerError';
import type { Room } from '@/lib/rooms';

type Change = 'joined' | 'left' | null;

function RoomContent({ room }: { room: Room }) {
  // `useChannel` exposes the live session count of the surrounding channel.
  const { sessionCount, loading, error } = useChannel();

  // Compare with the previous count to announce joins and leaves. The first
  // count after connecting is a baseline, not a change.
  const [prevCount, setPrevCount] = useState<number | null>(null);
  const [change, setChange] = useState<Change>(null);
  if (!loading && sessionCount !== prevCount) {
    setPrevCount(sessionCount);
    if (prevCount !== null) {
      setChange(sessionCount > prevCount ? 'joined' : 'left');
    }
  }

  useEffect(() => {
    if (!change) return;
    const timer = setTimeout(() => setChange(null), 3000);
    return () => clearTimeout(timer);
  }, [change, sessionCount]);

  const status = error ? 'error' : loading ? 'connecting' : 'connected';

  return (
    <>
      <Header status={status} roomKey={room.key} />
      <main className="main">
        <Link className="back-link" href="/">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          All rooms
        </Link>
        {error ? (
          <ServerError />
        ) : (
          <section className="card room">
            <h2 className="room-title">{room.name}</h2>
            <p className="room-description">{room.description}</p>
            <p className="count" aria-live="polite">
              {loading ? (
                <span className="count-label">Joining…</span>
              ) : (
                <>
                  <span className="count-value">{sessionCount}</span>
                  <span className="count-label">
                    {sessionCount === 1 ? 'person here' : 'people here'}
                  </span>
                </>
              )}
            </p>
            <p className="change" aria-live="polite">
              {change === 'joined' && 'Someone joined'}
              {change === 'left' && 'Someone left'}
            </p>
            <p className="hint">
              The count includes you. A closed tab can take a few seconds to
              drop out.
            </p>
          </section>
        )}
      </main>
    </>
  );
}

export default function RoomView({ room }: { room: Room }) {
  // `ChannelProvider` attaches to the room's channel while this view is
  // mounted and detaches when you leave.
  return (
    <ChannelProvider channelKey={room.key}>
      <RoomContent room={room} />
    </ChannelProvider>
  );
}
