import yorkie, {
  type Counter,
  type JSONObject,
  StreamConnectionStatus,
} from '@yorkie-js/sdk';
import { displayPeers, randomName, type PeerPresence } from './peer';
import './index.css';

const API_ADDR = import.meta.env.VITE_YORKIE_API_ADDR;

// The server rejects an attach beyond the project's "Max Attachments Per
// Document" with the Connect status `resource_exhausted` (code 8). The same
// status also covers other limits, such as a document or change that is too
// large, and the server attaches no Yorkie error code to this rejection, so
// the message is the only way to tell them apart. A dedicated error code on
// the server would make this check cleaner.
const RESOURCE_EXHAUSTED = 8;
const ATTACHMENT_LIMIT_MESSAGE = 'attachment limit exceeded';

// Older versions of this example kept the count as a plain number, which
// loses clicks when two clients increase it at the same time. A Counter adds
// concurrent increases up instead.
type Root = { counter: Counter | number };

type Status = 'connecting' | 'connected' | 'offline' | 'error' | 'full';
const statusLabels: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
  full: 'Document full',
};

const statusElem = document.getElementById('status')!;
const statusLabelElem = document.getElementById('status-label')!;
const peersElem = document.getElementById('peers')!;
const counterElem = document.getElementById('counter')!;
const counterValueElem = document.getElementById('counter-value')!;
const incrementBtn = document.getElementById('increment') as HTMLButtonElement;
const counterNoteElem = document.getElementById('counter-note')!;

// The "another tab" link opens this same URL, so the next client attaches to
// the same document.
document
  .getElementById('new-tab-link')!
  .setAttribute('href', window.location.href);

function setStatus(status: Status) {
  statusElem.dataset.status = status;
  statusLabelElem.textContent = statusLabels[status];
}

function showNote(text: string) {
  counterNoteElem.textContent = text;
  counterNoteElem.hidden = !text;
}

/**
 * `showMessage` replaces the counter with a title, a message and a reload
 * button. It is used for the "document is full" and error states.
 */
function showMessage(title: string, message: string) {
  const heading = document.createElement('h1');
  heading.className = 'counter__title';
  heading.textContent = title;
  const text = document.createElement('p');
  text.className = 'counter__note';
  text.textContent = message;
  const reload = document.createElement('button');
  reload.className = 'button';
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => window.location.reload());
  counterElem.replaceChildren(heading, text, reload);
}

function isAttachmentLimitError(err: unknown): boolean {
  const { code, rawMessage } = (err ?? {}) as {
    code?: unknown;
    rawMessage?: unknown;
  };
  return (
    code === RESOURCE_EXHAUSTED &&
    typeof rawMessage === 'string' &&
    rawMessage.includes(ATTACHMENT_LIMIT_MESSAGE)
  );
}

/**
 * `counterOf` returns the document's counter, first replacing a plain number
 * left by an older version of this example with a Counter of the same value.
 * Call it inside `doc.update`.
 */
function counterOf(root: JSONObject<Root>): Counter {
  if (typeof root.counter === 'number') {
    root.counter = new yorkie.Counter(root.counter);
  }
  return root.counter as Counter;
}

/**
 * `countOf` reads the counter's value, whether it is a Counter or a number.
 */
function countOf(root: Root): number {
  const { counter } = root;
  if (counter === undefined) return 0;
  return Number(typeof counter === 'number' ? counter : counter.getValue());
}

async function main() {
  const client = new yorkie.Client({
    rpcAddr: API_ADDR,
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();

  const doc = new yorkie.Document<Root, PeerPresence>(
    'vanilla-document-limit',
    { enableDevtools: import.meta.env.DEV },
  );

  // Presences are keyed by the client's actor ID.
  doc.subscribe('presence', () => {
    displayPeers(peersElem, doc.getPresences(), client.getActorID()!);
  });

  // When the project's "Max Subscribers Per Document" is reached, this client
  // stays attached but its watch stream is refused, so it shows Offline while
  // the SDK retries every second.
  doc.subscribe('connection', (event) => {
    const online = event.value === StreamConnectionStatus.Connected;
    setStatus(online ? 'connected' : 'offline');
    incrementBtn.disabled = !online;
    showNote(online ? '' : 'Live updates are paused. Yorkie keeps retrying.');
  });

  doc.subscribe(() => {
    counterValueElem.textContent = String(countOf(doc.getRoot()));
  });

  incrementBtn.addEventListener('click', () => {
    doc.update((root) => {
      counterOf(root).increase(1);
    }, 'increment counter');
  });

  try {
    await client.attach(doc, {
      initialRoot: { counter: new yorkie.Counter(0) },
      initialPresence: { username: randomName() },
    });
  } catch (err) {
    if (isAttachmentLimitError(err)) {
      setStatus('full');
      showMessage(
        'This document is full',
        'The project allows only a limited number of clients on this ' +
          'document. Close one of the other tabs, then reload.',
      );
      await client.deactivate();
      return;
    }
    throw err;
  }

  doc.update((root) => {
    counterOf(root);
  }, 'use a Counter for the counter');
  counterValueElem.textContent = String(countOf(doc.getRoot()));
  displayPeers(peersElem, doc.getPresences(), client.getActorID()!);
}

main().catch(() => {
  setStatus('error');
  showMessage(
    'Something went wrong',
    `Couldn't reach the Yorkie server at ${API_ADDR}. ` +
      "Check that it's running, then reload.",
  );
});
