import { StreamConnectionStatus } from '@yorkie-js/sdk';

export const connection = {
  isOnline: false,
  showOffline: (statusElem, incrementBtn, errorElem) => {
    connection.isOnline = false;
    statusElem.innerHTML = '<span class="red"> </span>';
    incrementBtn.disabled = true;
    errorElem.innerHTML = 'Stream subscription is disconnected';
  },
  showOnline: (statusElem, incrementBtn, errorElem) => {
    connection.isOnline = true;
    statusElem.innerHTML = '<span class="green"> </span>';
    incrementBtn.disabled = false;
    errorElem.innerHTML = '';
  },
  statusListener: (statusElem, incrementBtn, errorElem) => {
    return (event) => {
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
