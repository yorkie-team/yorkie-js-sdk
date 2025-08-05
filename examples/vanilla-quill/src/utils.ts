import { Document, Indexable } from '@yorkie-js/sdk';
import { YorkieDoc, YorkiePresence } from './type';

// function to display peers
export function displayPeers(
  elem: HTMLElement,
  peers: Array<{ clientID: string; presence: Indexable }>,
  myClientID: string,
) {
  const usernames = [];
  for (const { clientID, presence } of peers) {
    usernames.push(
      myClientID === clientID
        ? `<b>${presence.username}</b>`
        : presence.username,
    );
  }
  elem.innerHTML = JSON.stringify(usernames);
}

// function to display document content
export function displayLog(
  elem: HTMLElement,
  textElem: HTMLElement,
  doc: Document<YorkieDoc, YorkiePresence>,
) {
  elem.innerText = doc.toJSON();
  textElem.innerText = doc.getRoot().content.toTestString();
}
