export const API_ADDR =
  process.env.NEXT_PUBLIC_YORKIE_API_ADDR || 'http://localhost:8080';

export interface Room {
  key: string;
  name: string;
  description: string;
}

// Each room is a Yorkie Channel. Every client attached to the same channel
// key is counted in the same room.
export const ROOMS: Room[] = [
  {
    key: 'nextjs-presence.lobby',
    name: 'Lobby',
    description: 'Start here and say hi.',
  },
  {
    key: 'nextjs-presence.design',
    name: 'Design review',
    description: 'Walk through mockups together.',
  },
  {
    key: 'nextjs-presence.engineering',
    name: 'Engineering',
    description: 'Pair on a tricky bug.',
  },
  {
    key: 'nextjs-presence.music',
    name: 'Music',
    description: 'Share what you are listening to.',
  },
];
