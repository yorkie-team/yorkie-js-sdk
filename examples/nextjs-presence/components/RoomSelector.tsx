import { ROOMS, ROOM_CATEGORIES } from '@/lib/rooms';
import './RoomSelector.css';

interface RoomSelectorProps {
  onRoomSelect: (roomId: string) => void;
  sessions: { key: string; sessionCount: number }[];
}

function RoomSelector({ onRoomSelect, sessions }: RoomSelectorProps) {
  const totalCount =
    sessions.find((p) => p.key === 'total')?.sessionCount ?? 0;

  return (
    <div className="room-selector">
      <div className="room-selector-header">
        <div className="room-selector-title-wrapper">
          <h2>Choose a Room</h2>
          <p>Join a room to see live online sessions</p>
        </div>
        <div className="room-selector-badge-wrapper">
          <span className="room-selector-badge">{totalCount} online</span>
          <span className="room-selector-label">in total</span>
        </div>
      </div>

      {ROOM_CATEGORIES.map((category) => {
        const categoryRooms = ROOMS.filter(
          (room) => room.categoryId === category.id,
        );
        const categoryKey = `${category.id}`;
        const categorySessionCount =
          sessions.find((p) => p.key === categoryKey)?.sessionCount || 0;

        return (
          <div key={category.id} className="room-category">
            <div className="room-category-header">
              <div className="room-category-title">
                <div className="room-category-name">
                  <h3>
                    {category.emoji} {category.name}
                  </h3>
                  <p>{category.description}</p>
                </div>
                <div className="room-category-badge-wrapper">
                  <span className="room-category-badge">
                    {categorySessionCount} online
                  </span>
                  <span className="room-category-label">in category</span>
                </div>
              </div>
            </div>

            <div className="room-grid">
              {categoryRooms.map((room) => {
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
                      <div className="room-card-badge-wrapper">
                        <span className="room-card-badge">
                          {sessionCount} online
                        </span>
                        <span className="room-card-label">in room</span>
                      </div>
                    </div>
                    <div className="room-card-action">
                      <span>Join Room</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="room-selector-tip">
        💡 Tip: Open multiple browser windows to test presence tracking!
      </div>
    </div>
  );
}

export default RoomSelector;
