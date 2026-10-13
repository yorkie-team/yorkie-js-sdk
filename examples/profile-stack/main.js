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

const MAX_PEER_VIEW = 3;
const SPEECH_BUBBLE_INDEX = {
  me: 0,
  peer: (index) => index + 1,
  more: 4,
};

let activeSpeechBubbleIndex = null;
let myPresence = null;
let peerList = [];

async function main() {
  await client.activate();
  doc.subscribe('presence', (e) => {
    initUserPresences(doc.getPresences());
    renderPeerList();
    initEditProfileModal();
    renderSpeechBubble(activeSpeechBubbleIndex);
  });
  await client.attach(doc, {
    initialPresence: {
      name: myRandomPresence.name,
      color: myRandomPresence.color,
    },
  });
  bindGlobalClickDismiss();
}

// A presence is keyed by the client's actor, not by the per-session id that
// `client.getID()` returns, so "me" is `client.getActorID()`. Comparing
// against `getID()` finds nobody and leaves `myPresence` undefined.
const initUserPresences = (peers) => {
  peerList = peers.filter(({ clientID: id }) => id !== client.getActorID());
  myPresence = peers.find(
    ({ clientID: id }) => id === client.getActorID(),
  )?.presence;
};

const bindGlobalClickDismiss = () => {
  window.addEventListener('click', (event) => {
    const $target = event.target;
    const $profile = $target.closest('.profile');
    const $speechBubble = $target.closest('.speech-bubble');
    const $editProfileModal = $target.closest('.modal');
    if ($profile || $speechBubble || $editProfileModal) {
      return;
    }
    removeAllSpeechBubbles();
  });
};

// user profile
// `color` is peer-controlled presence just like `name`, so it never reaches an
// HTML parser: a value like `red" onerror="...` would break out of the `src`
// attribute if it were interpolated into `innerHTML`. The icon is built as
// elements, the URL is assigned through the `src` property, and the colour is
// clamped to the palette the example actually ships images for so a peer cannot
// point the image anywhere else either.
const PROFILE_COLORS = ['red', 'yellow', 'orange', 'green', 'blue', 'purple'];
const profileImageSrc = (color) =>
  `./images/profile-${
    PROFILE_COLORS.includes(color) ? color : PROFILE_COLORS[0]
  }.svg`;

const createUserIcon = (color) => {
  const $peer = document.createElement('div');
  $peer.className = 'peer';
  const $profile = document.createElement('div');
  $profile.className = 'profile';
  const $img = document.createElement('img');
  $img.className = 'profile-img';
  $img.alt = 'profile';
  $img.src = profileImageSrc(color);
  $profile.appendChild($img);
  $peer.appendChild($profile);
  return $peer;
};

const createSmallUserProfile = (color, name) => {
  const $peer = document.createElement('div');
  $peer.className = 'small-peer';
  const $userIcon = createUserIcon(color);
  $userIcon.className = 'user-icon';
  $peer.appendChild($userIcon);
  $peer.appendChild(document.createElement('span'));
  $peer.querySelector('span').className = 'name';
  // `name` is whatever a peer typed into its own presence, so it goes in as
  // text. Interpolating it into `innerHTML` let any collaborator run script in
  // every other participant's page just by saving a display name like
  // `<img src=x onerror=...>`.
  $peer.querySelector('span').textContent = name;
  return $peer;
};

export const renderPeerList = () => {
  const $peerList = document.getElementById('peerList');
  $peerList.innerHTML = '';
  const $me = createUserIcon(myPresence.color);
  const $profile = $me.querySelector('.profile');
  $profile.addEventListener('click', () => {
    activeSpeechBubbleIndex = SPEECH_BUBBLE_INDEX.me;
    renderSpeechBubble(activeSpeechBubbleIndex);
  });
  $me.classList.add('me');
  $peerList.appendChild($me);

  peerList.forEach((peer, i) => {
    const { color } = peer.presence;
    if (i < MAX_PEER_VIEW) {
      const $peer = createUserIcon(color);
      const $profile = $peer.querySelector('.profile');
      $profile.addEventListener('click', () => {
        activeSpeechBubbleIndex = SPEECH_BUBBLE_INDEX.peer(i);
        renderSpeechBubble(activeSpeechBubbleIndex);
      });
      $peerList.appendChild($peer);
      return;
    }
  });

  const hasMorePeers = peerList.length > MAX_PEER_VIEW;

  if (hasMorePeers) {
    const $viewMore = document.createElement('div');
    $viewMore.className = 'peer more';
    $viewMore.innerHTML = `
      <div class="profile">
      +${peerList.length - MAX_PEER_VIEW}
      </div>
    `;
    $peerList.appendChild($viewMore);
    const $profile = $viewMore.querySelector('.profile');
    $profile.addEventListener('click', () => {
      activeSpeechBubbleIndex = SPEECH_BUBBLE_INDEX.more;
      renderSpeechBubble(activeSpeechBubbleIndex);
    });
  }
};

// speech bubble
const createSpeechBubbleContainer = () => {
  const $speechBubbleContainer = document.createElement('div');
  $speechBubbleContainer.className = 'speech-bubble';
  return $speechBubbleContainer;
};

const createUserNameSpeechBubble = (name, isMe) => {
  const $speechBubbleContainer = createSpeechBubbleContainer();
  const $editProfileBtn = document.createElement('button');
  $editProfileBtn.className = 'edit-profile-btn';
  $editProfileBtn.innerHTML = 'Edit Profile';
  $editProfileBtn.addEventListener('click', openEditModal);
  // See `createSmallUserProfile`: `name` is peer-controlled, so the bubble is
  // built as an element with a text child rather than interpolated markup.
  const $name = document.createElement('span');
  $name.className = 'name';
  $name.textContent = `${name}${isMe ? ' (me)' : ''}`;
  $speechBubbleContainer.appendChild($name);
  if (isMe) {
    $speechBubbleContainer.classList.add('me');
    $speechBubbleContainer.appendChild($editProfileBtn);
  }
  return $speechBubbleContainer;
};

const createPeerListSpeechBubble = (moreUserProfiles) => {
  const $speechBubbleContainer = createSpeechBubbleContainer();
  moreUserProfiles.forEach((profile) => {
    $speechBubbleContainer.appendChild(
      createSmallUserProfile(profile.color, profile.name),
    );
  });
  return $speechBubbleContainer;
};

const removeAllSpeechBubbles = () => {
  const $speechBubble = document.querySelectorAll(`.speech-bubble`);
  $speechBubble.forEach((bubble) => {
    bubble.remove();
  });
};

export const renderSpeechBubble = (speechBubbleIndex) => {
  removeAllSpeechBubbles();
  let $speechBubble;
  if (speechBubbleIndex === null) return;
  if (speechBubbleIndex === SPEECH_BUBBLE_INDEX.me) {
    $speechBubble = createUserNameSpeechBubble(myPresence?.name, true);
  } else if (speechBubbleIndex === SPEECH_BUBBLE_INDEX.more) {
    const moreUserProfiles = peerList
      .filter((_, i) => i >= MAX_PEER_VIEW)
      .map(({ presence }) => ({
        color: presence.color,
        name: presence.name,
      }));
    $speechBubble = createPeerListSpeechBubble(moreUserProfiles);
    $speechBubble.classList.add('peer-more-list');
  } else {
    const peerName = peerList[speechBubbleIndex - 1].presence.name;
    $speechBubble = createUserNameSpeechBubble(peerName, false);
  }
  const $targetPeer =
    document.querySelectorAll(`#peerList .peer`)[speechBubbleIndex];
  $targetPeer.appendChild($speechBubble);
};

// modal
const initEditProfileModal = () => {
  const $editProfileModal = document.getElementById('editProfileModal');
  const $editProfileModalCloseBtn = $editProfileModal.querySelector('.close');
  $editProfileModalCloseBtn.addEventListener('click', closeEditModal);
  const $editProfileModalInput = $editProfileModal.querySelector('input');
  $editProfileModalInput.defaultValue = myPresence?.name;
  const $editProfileModalSaveBtn = $editProfileModal.querySelector('.save');
  $editProfileModalSaveBtn.addEventListener('click', saveEditProfile);
  const $editProfileModalImg = $editProfileModal.querySelector('.profile-img');
  $editProfileModalImg.src = profileImageSrc(myPresence?.color);
};

const openEditModal = () => {
  const $editProfileModal = document.getElementById('editProfileModal');
  $editProfileModal.style.display = 'block';
};

const closeEditModal = () => {
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

main();
