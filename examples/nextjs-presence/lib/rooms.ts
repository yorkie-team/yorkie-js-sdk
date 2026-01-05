// Room category definition
export interface RoomCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

// Individual room definition
export interface Room {
  id: string;
  name: string;
  description: string;
  key: string;
  categoryId: string;
}

// Room categories
export const ROOM_CATEGORIES: RoomCategory[] = [
  {
    id: 'general',
    name: 'General',
    emoji: '💬',
    description: 'General discussion',
  },
  {
    id: 'development',
    name: 'Development',
    emoji: '💻',
    description: 'Tech talk and coding',
  },
  {
    id: 'random',
    name: 'Random',
    emoji: '🎲',
    description: 'Off-topic chat',
  },
  {
    id: 'music',
    name: 'Music',
    emoji: '🎵',
    description: 'Share your favorite tunes',
  },
];

// Generate rooms with hierarchical structure
const generateRooms = (): Room[] => {
  const rooms: Room[] = [];
  const roomsPerCategory = 4;

  ROOM_CATEGORIES.forEach((category) => {
    for (let i = 1; i <= roomsPerCategory; i++) {
      rooms.push({
        id: `${category.id}.${i}`,
        name: `${category.emoji} ${category.name} #${i}`,
        description: category.description,
        key: `${category.id}.${i}`,
        categoryId: category.id,
      });
    }
  });

  return rooms;
};

// Available rooms with hierarchical structure
export const ROOMS = generateRooms();
