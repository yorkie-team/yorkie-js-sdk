import { StreamConnectionStatus } from '@yorkie-js/sdk';

type Status = 'connecting' | 'connected' | 'offline' | 'error';

const LABELS: Record<Status, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  error: 'Error',
};

/**
 * `displayStatus` shows the connection state as a dot plus a text label.
 */
export function displayStatus(elem: HTMLElement, status: Status) {
  elem.dataset.state = status;
  elem.querySelector('.status-text')!.textContent = LABELS[status];
}

/**
 * `statusListener` maps the document's watch stream to the status display.
 * Use it with `doc.subscribe('connection', ...)`.
 */
export function statusListener(elem: HTMLElement) {
  return (event: { value: StreamConnectionStatus }) => {
    displayStatus(
      elem,
      event.value === StreamConnectionStatus.Connected
        ? 'connected'
        : 'offline',
    );
  };
}

/**
 * `displayError` replaces the editor with a plain message and how to recover.
 */
export function displayError(
  statusElem: HTMLElement,
  errorElem: HTMLElement,
  rpcAddr: string,
) {
  displayStatus(statusElem, 'error');
  errorElem.textContent =
    `Couldn't reach the Yorkie server at ${rpcAddr}. ` +
    `Check that it's running, then reload.`;
  errorElem.hidden = false;
}
