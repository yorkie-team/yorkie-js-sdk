import { DocEvent, StreamConnectionStatus } from '@yorkie-js/sdk';

export const connection = {
  isOnline: false,
  showOffline: (
    statusElem: HTMLElement,
    incrementBtn: HTMLElement,
    errorElem: HTMLElement,
  ) => {
    connection.isOnline = false;
    statusElem.innerHTML = '<span class="red"> </span>';
    (incrementBtn as HTMLButtonElement).disabled = true;
    errorElem.innerHTML = 'Stream subscription is disconnected';
  },
  showOnline: (
    statusElem: HTMLElement,
    incrementBtn: HTMLElement,
    errorElem: HTMLElement,
  ) => {
    connection.isOnline = true;
    statusElem.innerHTML = '<span class="green"> </span>';
    (incrementBtn as HTMLButtonElement).disabled = false;
    errorElem.innerHTML = '';
  },
  statusListener: (
    statusElem: HTMLElement,
    incrementBtn: HTMLElement,
    errorElem: HTMLElement,
  ) => {
    return (event: DocEvent) => {
      if (
        connection.isOnline &&
        event.value === StreamConnectionStatus.Disconnected
      ) {
        connection.showOffline(statusElem, incrementBtn, errorElem);
      } else if (
        !connection.isOnline &&
        event.value === StreamConnectionStatus.Connected
      ) {
        connection.showOnline(statusElem, incrementBtn, errorElem);
      }
    };
  },
};
