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
  const myClientID = client.getID();

  const doc = new yorkie.Document('profile-stack');
  await client.attach(doc);

  client.subscribe((event) => {
    if (event.type === 'peers-changed') {
      // get presence of all clients connected to the Document.
      // {<clientID>: {name: string, color: string}}
      const peers = event.value[doc.getKey()];

      // show peer list
      displayPeerList(peers, myClientID);
    }
  });

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
  const peerList = Object.entries(peers)
    .filter(([id]) => id !== myClientID)
    .filter(([, presence]) => presence.name && presence.color);
  const peerCount = peerList.length + 1;
  const hasMorePeers = peerCount > MAX_PEER_VIEW;
  const $peerList = document.getElementById('peerList');
  $peerList.innerHTML = '';
  const $peerMoreList = document.createElement('div');
  $peerMoreList.className = 'peer-more-list speech-bubbles';

  const myInfo = peers[myClientID];
  const $me = createPeer(`${myInfo.name} (me)`, myInfo.color, 'main');
  $me.classList.add('me');
  $peerList.appendChild($me);
  peerList.forEach(([_, { name, color }], i) => {
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
