'use client';

import { ChannelProvider } from '@yorkie-js/react';
import { ROOMS } from '@/lib/rooms';
import PresenceCounter from './PresenceCounter';
import './RoomView.css';

interface RoomViewProps {
  roomId: string;
  onLeave: () => void;
}

function RoomView({ roomId, onLeave }: RoomViewProps) {
  const room = ROOMS.find((r) => r.id === roomId);

  if (!room) {
    return (
      <div className="room-view error">
        <p>Room not found</p>
        <button onClick={onLeave}>Go Back</button>
      </div>
    );
  }

  return (
    <ChannelProvider channelKey={room.key} isRealtime={true}>
      <div className="room-view">
        <div className="room-view-header">
          <button className="back-button" onClick={onLeave}>
            ← Back to Rooms
          </button>
        </div>

        <div className="room-view-content">
          <div className="room-info">
            <h2>{room.name}</h2>
            <p>{room.description}</p>
          </div>

          <PresenceCounter />

          <div className="room-instructions">
            <h3>Try it out!</h3>
            <ul>
              <li>🪟 Open this page in multiple browser windows or tabs</li>
              <li>
                👀 Watch the user count update in real-time as you join/leave
              </li>
              <li>🏠 Switch rooms to see independent presence tracking</li>
            </ul>
          </div>

          <div className="room-demo-area">
            <h3>You&apos;re connected!</h3>
            <p>
              This is room <strong>{room.id}</strong> with presence key:{' '}
              <code>{room.key}</code>
            </p>
            <p className="demo-hint">
              Each room has its own presence key, allowing independent user
              counting.
            </p>
          </div>
        </div>
      </div>
    </ChannelProvider>
  );
}

export default RoomView;
