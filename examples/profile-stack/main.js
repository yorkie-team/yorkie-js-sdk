import yorkie from '@yorkie-js/sdk';
import { getRandomName, getPeerColor } from './util.js';

const API_ADDR = import.meta.env.VITE_YORKIE_API_ADDR;

const client = new yorkie.Client({
  rpcAddr: API_ADDR,
  apiKey: import.meta.env.VITE_YORKIE_API_KEY,
});

// Everyone who opens this page attaches to the same document, so the stack
// lists every client that is currently on it.
const doc = new yorkie.Document('profile-stack', {
  enableDevtools: import.meta.env.DEV,
});

// Show yourself and up to this many peers; the rest collapse into "+N".
const MAX_PEERS_SHOWN = 3;

const $status = document.getElementById('status');
const $stage = document.getElementById('stage');
const $stack = document.getElementById('stack');
const $caption = document.getElementById('caption');
const $dialog = document.getElementById('nameDialog');
const $nameForm = document.getElementById('nameForm');
const $nameInput = document.getElementById('nameInput');
const $nameError = document.getElementById('nameError');

let me = null;
let peers = [];
// Which bubble is open: a peer's client ID, 'more', or null.
let openBubble = null;

async function main() {
  await client.activate();

  // `presence` fires whenever someone joins, leaves or changes their name.
  doc.subscribe('presence', () => {
    // Presences are keyed by the client's actor ID, so "me" is the entry
    // whose `clientID` matches `client.getActorID()`.
    const myID = client.getActorID();
    const presences = doc.getPresences();
    me = presences.find(({ clientID }) => clientID === myID);
    peers = presences.filter(({ clientID }) => clientID !== myID);
    render();
  });

  // `connection` reports whether the watch stream to the server is alive.
  doc.subscribe('connection', (event) => {
    setStatus(event.value === 'connected' ? 'connected' : 'offline');
  });

  await client.attach(doc, {
    initialPresence: { name: getRandomName() },
  });
  setStatus('connected');
}

const STATUS_LABELS = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
};
const setStatus = (state) => {
  $status.dataset.state = state;
  $status.querySelector('.status-label').textContent = STATUS_LABELS[state];
};

// Names are typed by peers, so they only ever go in through `textContent`.
// A peer may also send no name at all, which must not break the stack.
const nameOf = (presence) => String(presence.name ?? '');

const createAvatar = ({ clientID, presence }) => {
  const $avatar = document.createElement('span');
  $avatar.className = 'avatar';
  $avatar.style.setProperty('--peer', getPeerColor(clientID));
  $avatar.textContent = nameOf(presence).charAt(0).toUpperCase() || '?';
  return $avatar;
};

const render = () => {
  // The stack is rebuilt on every change; remember which button had focus so
  // keyboard users don't lose their place.
  const focusedKey = document.activeElement?.dataset.key;
  $stack.replaceChildren();
  if (!me) return;

  // Your own entry: avatar plus name. Clicking it opens the name dialog.
  const $meItem = document.createElement('li');
  $meItem.className = 'me';
  const $meButton = document.createElement('button');
  $meButton.className = 'me-button';
  $meButton.dataset.key = 'me';
  $meButton.title = 'You';
  $meButton.setAttribute(
    'aria-label',
    `${nameOf(me.presence)} (you), change name`,
  );
  const $meName = document.createElement('span');
  $meName.className = 'me-name';
  $meName.textContent = nameOf(me.presence);
  const $meTag = document.createElement('span');
  $meTag.className = 'me-tag';
  $meTag.textContent = 'you';
  $meButton.append(createAvatar(me), $meName, $meTag);
  $meButton.addEventListener('click', openNameDialog);
  $meItem.append($meButton);
  $stack.append($meItem);

  // Peers: avatars that show the name in a bubble when clicked.
  peers.slice(0, MAX_PEERS_SHOWN).forEach((peer) => {
    const $item = document.createElement('li');
    $item.className = 'peer';
    const $button = document.createElement('button');
    $button.className = 'peer-button';
    $button.dataset.key = peer.clientID;
    $button.title = nameOf(peer.presence);
    $button.setAttribute('aria-label', nameOf(peer.presence));
    $button.append(createAvatar(peer));
    $button.addEventListener('click', () => toggleBubble(peer.clientID));
    $item.append($button);
    if (openBubble === peer.clientID) {
      $item.append(createBubble([peer]));
    }
    $stack.append($item);
  });

  const rest = peers.slice(MAX_PEERS_SHOWN);
  if (rest.length > 0) {
    const $item = document.createElement('li');
    $item.className = 'peer';
    const $button = document.createElement('button');
    $button.className = 'peer-button more';
    $button.dataset.key = 'more';
    $button.setAttribute('aria-label', `${rest.length} more people`);
    $button.textContent = `+${rest.length}`;
    $button.addEventListener('click', () => toggleBubble('more'));
    $item.append($button);
    if (openBubble === 'more') {
      $item.append(createBubble(rest));
    }
    $stack.append($item);
  }

  const others = peers.length === 1 ? 'other' : 'others';
  $caption.textContent =
    peers.length === 0
      ? 'Only you are here · click your avatar to change your name'
      : `You and ${peers.length} ${others} are here · ` +
        'click your avatar to change your name';

  keepBubbleOnScreen();
  if (focusedKey) {
    $stack.querySelector(`[data-key="${focusedKey}"]`)?.focus();
  }
};

// bubble
const createBubble = (people) => {
  const $bubble = document.createElement('ul');
  $bubble.className = 'bubble';
  people.forEach((person) => {
    const $row = document.createElement('li');
    $row.className = 'bubble-row';
    const $name = document.createElement('span');
    $name.textContent = nameOf(person.presence);
    $row.append(createAvatar(person), $name);
    $bubble.append($row);
  });
  return $bubble;
};

const toggleBubble = (key) => {
  openBubble = openBubble === key ? null : key;
  render();
};

// On narrow screens a bubble under the last avatar would stick out of the
// viewport, so nudge it back in.
const keepBubbleOnScreen = () => {
  const $bubble = $stack.querySelector('.bubble');
  if (!$bubble) return;
  const { left, right } = $bubble.getBoundingClientRect();
  const margin = 16;
  const shift =
    Math.max(0, margin - left) -
    Math.max(0, right - (window.innerWidth - margin));
  $bubble.style.translate = `${shift}px 0`;
};

window.addEventListener('click', (event) => {
  if (openBubble !== null && !event.target.closest('.peer')) {
    toggleBubble(null);
  }
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openBubble !== null) {
    toggleBubble(null);
  }
});

// name dialog: a native <dialog> traps focus and closes on Escape. It returns
// focus to the button that opened it, but a render while it was open may have
// replaced that button, so focus your avatar again once it closes.
$dialog.addEventListener('close', () => {
  $stack.querySelector('[data-key="me"]')?.focus();
});

const openNameDialog = () => {
  $nameInput.value = nameOf(me.presence);
  $nameError.hidden = true;
  $nameInput.removeAttribute('aria-invalid');
  $dialog.showModal();
  $nameInput.select();
};

$nameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $nameInput.value.trim();
  if (!name) {
    $nameError.hidden = false;
    $nameInput.setAttribute('aria-invalid', 'true');
    $nameInput.focus();
    return;
  }
  // Close first so focus is back on your avatar before the stack re-renders.
  $dialog.close();
  // Presence changes are sent to every peer, which re-renders their stack.
  doc.update((_, presence) => {
    presence.set({ name });
  });
});
document
  .getElementById('nameCancel')
  .addEventListener('click', () => $dialog.close());

main().catch(() => {
  setStatus('error');
  const $error = document.createElement('p');
  $error.className = 'error';
  $error.textContent =
    `Couldn't reach the Yorkie server at ${API_ADDR}. ` +
    "Check that it's running, then reload.";
  $stage.replaceChildren($error);
});
