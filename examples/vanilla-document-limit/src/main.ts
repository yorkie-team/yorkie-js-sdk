import yorkie, { DocEventType } from '@yorkie-js/sdk';
import { connection } from './connection.js';
import { displayPeers } from './peer.js';
import { displayCounter } from './counter.js';
import './index.css';

const peersElem = document.getElementById('peers');
const counterValueElem = document.getElementById('counter-value');
const incrementBtn = document.getElementById('increment');
const errorElem = document.getElementById('error');
const connectionStatusElem = document.getElementById('connection-status');
const peersContainerElem = document.getElementById('peers-container');
const connectionStatusContainerElem = document.getElementById(
  'connection-status-container',
);
const counterContainerElem = document.getElementById('counter-container');

/**
 * Main function
 */
async function main() {
  const client = new yorkie.Client({
    rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();

  const doc = new yorkie.Document('vanilla-document-limit', {
    enableDevtools: true,
  });

  doc.subscribe('presence', (event) => {
    if (event.type !== DocEventType.PresenceChanged) {
      const presences = doc.getPresences() as Array<{
        clientID: string;
        presence: { username: string };
      }>;
      displayPeers(peersElem!, presences, client.getID()!);
    }
  });

  doc.subscribe('connection', (event) => {
    connection.statusListener(
      connectionStatusElem!,
      incrementBtn!,
      errorElem!,
    )(event);
  });

  doc.subscribe(() => {
    const root = doc.getRoot() as { counter: number };
    displayCounter(counterValueElem!, root.counter);
  });

  doc.subscribe('status', (event) => {
    console.log(event);
  });

  incrementBtn!.addEventListener('click', () => {
    doc.update((root) => {
      const typedRoot = root as { counter: number };
      typedRoot.counter += 1;
    }, 'increment counter');
  });

  await client
    .attach(doc, {
      initialRoot: {
        counter: 0,
      },
      initialPresence: {
        username: client.getID()!.slice(-2),
      },
    })
    .catch((error) => {
      if (error.message.includes('attachment limit exceeded')) {
        errorElem!.innerHTML = `<p>${error.message}</p>`;
        peersContainerElem!.innerHTML = '';
        connectionStatusContainerElem!.innerHTML = '';
        counterContainerElem!.innerHTML = '';
      }
    });
  const root = doc.getRoot() as { counter: number };
  displayCounter(counterValueElem!, root.counter);
}

main();
