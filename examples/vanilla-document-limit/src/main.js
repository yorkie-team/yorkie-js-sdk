import yorkie, { DocEventType, StreamConnectionStatus } from '@yorkie-js/sdk';
import { network } from './network.js';
import { displayPeers } from './peer.js';
import { displayCounter } from './counter.js';
import './index.css';

const peersElem = document.getElementById('peers');
const counterValueElem = document.getElementById('counter-value');
const incrementBtn = document.getElementById('increment');
const errorElem = document.getElementById('error');
const networkStatusElem = document.getElementById('network-status');
const peersContainerElem = document.getElementById('peers-container');
const networkStatusContainerElem = document.getElementById(
  'network-status-container',
);
const counterContainerElem = document.getElementById('counter-container');
async function main() {
  const client = new yorkie.Client(import.meta.env.VITE_YORKIE_API_ADDR, {
    apiKey: import.meta.env.VITE_YORKIE_API_KEY,
  });
  await client.activate();
  window.addEventListener('beforeunload', () => {
    client.deactivate({ keepalive: true });
  });

  const doc = new yorkie.Document('vanilla-max-attachments-per-document', {
    enableDevtools: true,
  });

  doc.subscribe('presence', (event) => {
    if (event.type !== DocEventType.PresenceChanged) {
      displayPeers(peersElem, doc.getPresences(), client.getID());
    }
  });

  doc.subscribe('connection', (event) => {
    network.statusListener(networkStatusElem)(event);
    if (event.value == StreamConnectionStatus.Disconnected) {
      incrementBtn.disabled = true;
      errorElem.innerHTML = `<p>Stream subscription is disconnected</p>`;
    }
  });

  doc.subscribe(() => {
    displayCounter(counterValueElem, doc.getRoot().counter);
  });

  doc.subscribe('status', (event) => {
    console.log(event);
  });

  incrementBtn.addEventListener('click', () => {
    doc.update((root) => {
      root.counter += 1;
    }, 'increment counter');
  });

  await client
    .attach(doc, {
      initialRoot: {
        counter: 0,
      },
      initialPresence: {
        username: client.getID().slice(-2),
      },
    })
    .catch((error) => {
      if (error.message.includes('attachment limit exceeded')) {
        errorElem.innerHTML = `<p>${error.message}</p>`;
        peersContainerElem.innerHTML = '';
        networkStatusContainerElem.innerHTML = '';
        counterContainerElem.innerHTML = '';
      }
    });
  displayCounter(counterValueElem, doc.getRoot().counter);
}

main();
