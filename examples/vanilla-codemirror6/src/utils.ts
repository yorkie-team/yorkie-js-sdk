import { Document, Indexable } from '@yorkie-js/sdk';
import { YorkieDoc } from './type';

// function to display peers
export function displayPeers(
  elem: HTMLElement,
  peers: Array<{ clientID: string; presence: Indexable }>,
  myClientID: string,
) {
  // `presence` is whatever a peer set for itself, so each username goes in as
  // a text node. Interpolating it into `innerHTML` let any collaborator run
  // script in every other participant's page just by attaching with a username
  // like `<img src=x onerror=...>`; `JSON.stringify` escapes quotes, not tags.
  elem.textContent = '';
  elem.appendChild(document.createTextNode('['));
  for (const { clientID, presence } of peers) {
    if (elem.childNodes.length > 1) {
      elem.appendChild(document.createTextNode(','));
    }
    const name = document.createElement(myClientID === clientID ? 'b' : 'span');
    name.textContent = JSON.stringify(String(presence.username));
    elem.appendChild(name);
  }
  elem.appendChild(document.createTextNode(']'));
}

// function to display document content
export function displayLog(
  elem: HTMLElement,
  textElem: HTMLElement,
  doc: Document<YorkieDoc>,
) {
  elem.innerText = doc.toJSON();
  textElem.innerText = doc.getRoot().content.toTestString();
}
