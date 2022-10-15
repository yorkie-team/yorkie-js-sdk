/* eslint-disable jsdoc/require-jsdoc */
import { Document, Indexable, Text } from 'yorkie-js-sdk';

// function to display peers
export function displayPeers(
  elem: HTMLElement,
  peers: Record<string, Indexable>,
  clientID: string,
) {
  const clientIDs = [];

  for (const [clientID] of Object.entries(peers)) {
    clientIDs.push(clientID);
  }

  elem.innerHTML = JSON.stringify(clientIDs).replace(
    clientID,
    `<b>${clientID}</b>`,
  );
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
