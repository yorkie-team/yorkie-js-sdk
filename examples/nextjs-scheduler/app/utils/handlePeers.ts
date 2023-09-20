import { Indexable } from 'yorkie-js-sdk';

const randomPeers = [
  'Alice',
  'Bob',
  'Carol',
  'Chuck',
  'Dave',
  'Erin',
  'Frank',
  'Grace',
  'Ivan',
  'Justin',
  'Matilda',
  'Oscar',
  'Steve',
  'Victor',
  'Zoe',
];

/**
 * display each peer's name
 */
export function displayPeers(
  peers: Array<{ clientID: string; presence: Indexable }>,
) {
  const users = [];
  for (const { presence } of peers) {
    users.push(presence.userName);
  }

  return users;
}

/**
 * create random name of anonymous peer
 */
export function createRandomPeers() {
  const index = Math.floor(Math.random() * randomPeers.length);

  return randomPeers[index];
}
