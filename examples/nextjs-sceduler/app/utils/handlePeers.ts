import { Indexable } from 'yorkie-js-sdk';

const randomPeers = [
  'John',
  'Alice',
  'Steven',
  'Kate',
  'Daniel',
  'Chang',
  'Marie',
  'Fred',
  'Sanchez',
  'Kim',
  'Wayne',
  'Seon',
  'Diaz',
  'Tom',
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
