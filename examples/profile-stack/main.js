import yorkie from '@yorkie-js/sdk';
import { getRandomName, getRandomColor } from './util.js';

const client = new yorkie.Client({
  rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
  apiKey: import.meta.env.VITE_YORKIE_API_KEY,
});

const doc = new yorkie.Document('profile-stack', {
  enableDevtools: true,
});

const myRandomPresence = {
  name: getRandomName(),
  color: getRandomColor(),
};

async function main() {
  await client.activate();
  doc.subscribe('presence', () => {
    displayPeerList(doc.getPresences(), client.getID());
  });
  await client.attach(doc, {
    // set the client's name and color to presence.
    initialPresence: {
      name: myRandomPresence.name,
      color: myRandomPresence.color,
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
  const $editProfileModal = $target.closest('.modal');
  if ($profile || $speechBubble || $editProfileModal) {
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

const openEditModal = () => {
  const $editProfileModal = document.getElementById('editProfileModal');
  $editProfileModal.style.display = 'block';
};

const closeEditModal = (e) => {
  const $editProfileModal = document.getElementById('editProfileModal');
  $editProfileModal.style.display = 'none';
};

const saveEditProfile = async () => {
  const $editProfileModal = document.getElementById('editProfileModal');
  const $editProfileModalInput = $editProfileModal.querySelector('input');
  const newName = $editProfileModalInput.value;
  doc.update((_, presence) => {
    presence.set({
      name: newName,
    });
  });
  closeEditModal();
};

const MAX_PEER_VIEW = 4;
const createPeer = (name, color, type, isMe = false) => {
  const $peer = document.createElement('div');
  $peer.className = 'peer';

  if (type === 'main') {
    const editProfileBtnHtml =
      '<button class="edit-profile-btn">Edit Profile</button>';
    $peer.innerHTML = `
    <div class="profile">
      <img src="./images/profile-${color}.svg" alt="profile" class="profile-img"/>
    </div>
    <div class="name speech-bubble ${isMe ? 'me' : ''}">
        ${name}
        ${isMe ? ' (me)' : ''}
        ${isMe ? editProfileBtnHtml : ''}
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

// TODO: when subscribed event is triggered, the client's UI should not be initialized.
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
  const $editProfileBtn = $me.querySelector('.edit-profile-btn');
  $editProfileBtn.addEventListener('click', openEditModal);
  const $editProfileModal = document.getElementById('editProfileModal');
  const $editProfileModalCloseBtn = $editProfileModal.querySelector('.close');
  $editProfileModalCloseBtn.addEventListener('click', closeEditModal);
  const $editProfileModalInput = $editProfileModal.querySelector('input');
  $editProfileModalInput.value = myPresence.name;
  const $editProfileModalSaveBtn = $editProfileModal.querySelector('.save');
  $editProfileModalSaveBtn.addEventListener('click', saveEditProfile);
  const $editProfileModalImg = $editProfileModal.querySelector('.profile-img');
  $editProfileModalImg.src = `./images/profile-${myPresence.color}.svg`;

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
