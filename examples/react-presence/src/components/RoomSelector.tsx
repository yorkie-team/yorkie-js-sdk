import { useEffect, useMemo } from 'react';
import { ROOMS } from '../App';
import './RoomSelector.css';

interface RoomSelectorProps {
  onRoomSelect: (roomId: string) => void;
  presences: { key: string, presenceCount: number }[];
}

function RoomSelector({ onRoomSelect, presences }: RoomSelectorProps) {
  return (
    <div className="room-selector">
      <h2>Choose a Room</h2>
      <p className="room-selector-subtitle">
        Join a room to see who else is online
      </p>

      <div className="room-grid">
        {ROOMS.map((room) => {
          const presenceCount = presences.find(p => p.key === room.key)?.presenceCount || 0;
          return <button
            key={room.id}
            className="room-card"
            onClick={() => onRoomSelect(room.id)}
          >
            <div className="room-card-header">
              <h3>{room.name}</h3>
              <span className="room-card-badge">{presenceCount} users</span>
            </div>
            <p className="room-card-description">{room.description}</p>
            <div className="room-card-action">
              <span>Join Room →</span>
            </div>
          </button>
        })}
      </div>

      <div className="room-selector-tip">
        💡 Tip: Open multiple browser windows to test presence tracking!
      </div>
    </div>
  );
}

export default RoomSelector;
