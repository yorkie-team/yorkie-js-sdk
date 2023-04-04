/* eslint-disable jsdoc/require-jsdoc */
import { Document, Indexable, Text } from 'yorkie-js-sdk';

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
export function displayLog<T extends { content: Text }>(
  elem: HTMLElement,
  textElem: HTMLElement,
  doc: Document<T>,
) {
  elem.innerText = doc.toJSON();
  textElem.innerText = doc.getRoot().content.getStructureAsString();
}
