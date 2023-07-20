/* eslint-disable jsdoc/require-jsdoc */
import { Document, Indexable } from 'yorkie-js-sdk';
import { YorkieDoc } from './type';

// function to display peers
export function displayPeers(
  elem: HTMLElement,
  peers: Array<{ clientID: string; presence: Indexable }>,
  myClientID: string,
) {
  const usernames = [];
  for (const { clientID } of peers) {
    usernames.push(myClientID === clientID ? `<b>${clientID}</b>` : clientID);
  }
  elem.innerHTML = JSON.stringify(usernames);
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
