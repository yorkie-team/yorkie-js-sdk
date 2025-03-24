export function displayPeers(elem, peers, myClientID) {
  const usernames = [];
  for (const { clientID, presence } of peers) {
    // console.log(clientID, presence);
    usernames.push(
      myClientID === clientID
        ? `<b>${presence.username}</b>`
        : presence.username,
    );
  }
  elem.innerHTML = JSON.stringify(usernames);
}