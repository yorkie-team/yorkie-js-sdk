import { DocEvent, StreamConnectionStatus } from 'yorkie-js-sdk';
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
    return (event: DocEvent) => {
      if (
        network.isOnline &&
        event.value == StreamConnectionStatus.Disconnected
      ) {
        network.showOffline(elem);
      } else if (
        !network.isOnline &&
        event.value == StreamConnectionStatus.Connected
      ) {
        network.showOnline(elem);
      }
    };
  },
};
