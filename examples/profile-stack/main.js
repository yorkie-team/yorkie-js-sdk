import yorkie, { DocEventType } from '@yorkie-js/sdk';
import { getRandomName, getRandomColor } from './util.js';

async function main() {
  const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();
  const doc = new yorkie.Document('profile-stack', {
    enableDevtools: true,
  });
  doc.subscribe('presence', (event) => {
    if (event.type !== DocEventType.PresenceChanged) {
      displayPeerList(doc.getPresences(), client.getID());
    }
  });
  await client.attach(doc, {
    // set the client's name and color to presence.
    initialPresence: {
      name: getRandomName(),
      color: getRandomColor(),
    },
  });

  window.addEventListener('beforeunload', () => {
    client.deactivate({ keepalive: true });
  });
}

const MAX_PEER_VIEW = 4;
const createPeer = (name, color, type) => {
  const $peer = document.createElement('div');
  $peer.className = 'peer';

  if (type === 'main') {
    $peer.innerHTML = `
    <div class="profile">
      <img src="./images/profile-${color}.svg" alt="profile" class="profile-img"/>
    </div>
    <div class="name speech-bubbles">${name}</div>
  `;
  } else if (type === 'more') {
    $peer.innerHTML = `
    <img src="./images/profile-${color}.svg" alt="profile" class="profile-img"/>
    <span class="name">${name}</span>
  `;
  }
  return $peer;
};

const displayPeerList = (peers, myClientID) => {
  const peerList = peers.filter(
    ({ clientID: id, presence }) =>
      id !== myClientID && presence.name && presence.color,
  );
  const peerCount = peerList.length + 1;
  const hasMorePeers = peerCount > MAX_PEER_VIEW;
  const $peerList = document.getElementById('peerList');
  $peerList.innerHTML = '';
  const $peerMoreList = document.createElement('div');
  $peerMoreList.className = 'peer-more-list speech-bubbles';

  const myPresence = peers.find(
    ({ clientID: id }) => id === myClientID,
  ).presence;
  const $me = createPeer(`${myPresence.name} (me)`, myPresence.color, 'main');
  $me.classList.add('me');
  $peerList.appendChild($me);
  peerList.forEach((peer, i) => {
    const { name, color } = peer.presence;
    if (i < MAX_PEER_VIEW - 1) {
      const $peer = createPeer(name, color, 'main');
      $peerList.appendChild($peer);
      return;
    }
    const $peer = createPeer(name, color, 'more');
    $peerMoreList.appendChild($peer);
  });

  if (hasMorePeers) {
    const $peer = document.createElement('div');
    $peer.className = 'peer more';
    $peer.innerHTML = `
      <div class="profile">
      +${peerCount - MAX_PEER_VIEW}
      </div>
    `;
    $peer.appendChild($peerMoreList);
    $peerList.appendChild($peer);
  }
};

main();
