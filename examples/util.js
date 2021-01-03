const network = {
  isOnline: false,
  showOffline: (elem) => {
    network.isOnline = false;
    elem.innerHTML = '<span class="red"> </span>';
  },
  showOnline: (elem) => {
    network.isOnline = true;
    elem.innerHTML = '<span class="green"> </span>';
  },
  statusListener: elem => {
    return (event) => {
      if (network.isOnline && (
        event.name == 'status-changed' && event.value == 'deactivated' ||
        event.name == 'stream-connection-status-changed' && event.value == 'disconnected' ||
        event.name == 'document-sync-result' && event.value == 'sync-failed'
      )) {
        network.showOffline(elem);
      } else if (!network.isOnline && (
        event.name == 'status-changed' && event.value == 'activated' ||
        event.name == 'stream-connection-status-changed' && event.value == 'connected' ||
        event.name == 'document-sync-result' && event.value == 'synced' ||
        event.name == 'peers-changed' ||
        event.name == 'documents-changed'
      )) {
        network.showOnline(elem);
      }
    }
  },
}
