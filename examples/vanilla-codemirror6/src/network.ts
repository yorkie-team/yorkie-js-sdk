import {
  ClientEvent,
  ClientEventType,
  ClientStatus,
  StreamConnectionStatus,
  DocumentSyncResultType,
} from 'yorkie-js-sdk';
export const network = {
  isOnline: false,
  showOffline: (elem: HTMLElement) => {
    network.isOnline = false;
    elem.innerHTML = '<span class="red"> </span>';
  },
  showOnline: (elem: HTMLElement) => {
    network.isOnline = true;
    elem.innerHTML = '<span class="green"> </span>';
  },
  statusListener: (elem: HTMLElement) => {
    return (event: ClientEvent) => {
      if (
        network.isOnline &&
        ((event.type == ClientEventType.StatusChanged &&
          event.value == ClientStatus.Deactivated) ||
          (event.type == ClientEventType.StreamConnectionStatusChanged &&
            event.value == StreamConnectionStatus.Disconnected) ||
          (event.type == ClientEventType.DocumentSynced &&
            event.value == DocumentSyncResultType.SyncFailed))
      ) {
        network.showOffline(elem);
      } else if (
        !network.isOnline &&
        ((event.type == ClientEventType.StatusChanged &&
          event.value == ClientStatus.Activated) ||
          (event.type == ClientEventType.StreamConnectionStatusChanged &&
            event.value == StreamConnectionStatus.Connected) ||
          (event.type == ClientEventType.DocumentSynced &&
            event.value == DocumentSyncResultType.Synced) ||
          event.type == ClientEventType.DocumentChanged)
      ) {
        network.showOnline(elem);
      }
    };
  },
};
