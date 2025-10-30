import { ROOMS } from '../App';
import './RoomSelector.css';

interface RoomSelectorProps {
  onRoomSelect: (roomId: string) => void;
}

function RoomSelector({ onRoomSelect }: RoomSelectorProps) {
  return (
    <div className="room-selector">
      <h2>Choose a Room</h2>
      <p className="room-selector-subtitle">
        Join a room to see who else is online
      </p>

      <div className="room-grid">
        {ROOMS.map((room) => (
          <button
            key={room.id}
            className="room-card"
            onClick={() => onRoomSelect(room.id)}
          >
            <div className="room-card-header">
              <h3>{room.name}</h3>
            </div>
            <p className="room-card-description">{room.description}</p>
            <div className="room-card-action">
              <span>Join Room →</span>
            </div>
          </button>
        ))}
      </div>

      <div className="room-selector-tip">
        💡 Tip: Open multiple browser windows to test presence tracking!
      </div>
    </div>
  );
}

export default RoomSelector;
