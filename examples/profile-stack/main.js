import yorkie from 'yorkie-js-sdk';
import { getRandomName, getRandomColor } from './util.js';

async function main() {
  const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
    // set the client's name and color to presence.
    presence: {
      name: getRandomName(),
      color: getRandomColor(),
    },
  });
  await client.activate();

  client.subscribe((event) => {
    if (event.type === 'peers-changed') {
      // show peer list
      displayPeerList(client.getPeersByDocKey(doc.getKey()), client.getID());
    }
  });

  const doc = new yorkie.Document('profile-stack');
  await client.attach(doc);

  window.addEventListener('beforeunload', () => {
    client.deactivate();
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
