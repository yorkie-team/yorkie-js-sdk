/* global document -- defined by browser */
import yorkie, { DocEventType } from '@yorkie-js/sdk';
import { getRandomName, getRandomColor } from './util.js';

async function main() {
  const client = new yorkie.Client({
    rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
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
}

const SPEECH_BUBBLE_INDEX = {
  me: 0,
  peer: (index) => index + 1,
  more: 4,
};

window.addEventListener('click', (event) => {
  const $target = event.target;
  const $profile = $target.closest('.profile');
  const $speechBubble = $target.closest('.speech-bubble');

  if ($profile || $speechBubble) {
    return;
  }
  hideSpeechBubble();
});

const hideSpeechBubble = () => {
  const $speechBubble = document.querySelectorAll(`.speech-bubble`);
  $speechBubble.forEach((bubble) => {
    bubble.classList.remove('visible');
  });
};

const showSpeechBubble = (index) => {
  hideSpeechBubble();
  const $speechBubble = document.querySelectorAll(`.speech-bubble`)[index];
  $speechBubble.classList.add('visible');
};

const MAX_PEER_VIEW = 4;
const createPeer = (name, color, type, isMe = false) => {
  const $peer = document.createElement('div');
  $peer.className = 'peer';

  if (type === 'main') {
    const editButtonHtml =
      '<button class="edit-profile-btn" onclick="openEditModal()">Edit Profile</button>';
    $peer.innerHTML = `
    <div class="profile">
      <img src="./images/profile-${color}.svg" alt="profile" class="profile-img"/>
    </div>
    <div class="name speech-bubble ${isMe ? 'me' : ''}">
        ${name}
        ${isMe ? ' (me)' : ''}
        ${isMe ? editButtonHtml : ''}
    </div>
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
  $peerMoreList.className = 'peer-more-list speech-bubble';
  $peerMoreList.addEventListener('click', () =>
    showSpeechBubble(SPEECH_BUBBLE_INDEX.more),
  );

  const myPresence = peers.find(
    ({ clientID: id }) => id === myClientID,
  ).presence;
  const $me = createPeer(`${myPresence.name}`, myPresence.color, 'main', true);
  const $profile = $me.querySelector('.profile');
  $profile.addEventListener('click', () =>
    showSpeechBubble(SPEECH_BUBBLE_INDEX.me),
  );
  $me.classList.add('me');
  $peerList.appendChild($me);
  peerList.forEach((peer, i) => {
    const { name, color } = peer.presence;
    if (i < MAX_PEER_VIEW - 1) {
      const $peer = createPeer(name, color, 'main');
      $peerList.appendChild($peer);
      const $profile = $peer.querySelector('.profile');
      $profile.addEventListener('click', () =>
        showSpeechBubble(SPEECH_BUBBLE_INDEX.peer(i)),
      );
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
    const $profile = $peer.querySelector('.profile');
    $profile.addEventListener('click', () =>
      showSpeechBubble(SPEECH_BUBBLE_INDEX.more),
    );
  }
};

main();
