const NAMES = [
  'Ali',
  'Beatriz',
  'Charles',
  'Diya',
  'Eric',
  'Fatima',
  'Gabriel',
  'Hanna',
  'Johnson',
  'Perry',
  'Parker',
  'Kelly',
];
export const getRandomName = () => {
  const index = Math.floor(Math.random() * NAMES.length);
  return NAMES[index];
};

// A peer's colour is derived from its actor ID instead of being stored in
// presence, so every tab picks the same colour for the same peer.
const PEER_COLORS = [
  '#fc8539',
  '#fdc433',
  '#23c176',
  '#3c9af1',
  '#f44954',
  '#855cf9',
];
export const getPeerColor = (actorID) => {
  let hash = 0;
  for (const char of actorID) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
};
