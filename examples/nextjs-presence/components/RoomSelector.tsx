import { ROOMS } from '@/lib/rooms';
import './RoomSelector.css';

interface RoomSelectorProps {
  onRoomSelect: (roomId: string) => void;
  sessions: { key: string; sessionCount: number }[];
}

function RoomSelector({ onRoomSelect, sessions }: RoomSelectorProps) {
  const totalCount =
    sessions.find((p) => p.key === 'room')?.sessionCount ?? 0;
  return (
    <div className="room-selector">
      <h2>
        Choose a Room
        <span className="room-selector-badge">{totalCount} users</span>
      </h2>
      <p className="room-selector-subtitle">
        Join a room to see who else is online
      </p>

      <div className="room-grid">
        {ROOMS.map((room) => {
          const sessionCount =
            sessions.find((p) => p.key === room.key)?.sessionCount || 0;
          return (
            <button
              key={room.id}
              className="room-card"
              onClick={() => onRoomSelect(room.id)}
            >
              <div className="room-card-header">
                <h3>{room.name}</h3>
                <span className="room-card-badge">{sessionCount} users</span>
              </div>
              <p className="room-card-description">{room.description}</p>
              <div className="room-card-action">
                <span>Join Room →</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="room-selector-tip">
        💡 Tip: Open multiple browser windows to test presence tracking!
      </div>
    </div>
  );
}

export default RoomSelector;
