import { createRoot } from 'react-dom/client';

import { SeleteNodeProvider } from '../contexts/SeletedNode';
import { SeletedPresenceProvider } from '../contexts/SeletedPresence';
import {
  YorkieSourceProvider,
  useCurrentDocKey,
} from '../contexts/YorkieSource';
import { Document } from '../tabs/Document';
import { Presence } from '../tabs/Presence';

const Panel = () => {
  const currentDocKey = useCurrentDocKey();

  if (!currentDocKey) {
    return (
      <div className="yorkie-devtools-empty">
        <p className="empty-title">Yorkie is not found in this page.</p>
        <p className="empty-desc">
          If this seems wrong, try reloading the page.
          <br /> Requires a development build of yorkie-js-sdk v0.4.14 or newer.
        </p>
        <button
          className="reload-btn"
          onClick={() => {
            chrome.tabs.reload(chrome.devtools.inspectedWindow.tabId);
          }}
        >
          Reload
        </button>
      </div>
    );
  }

  return (
    <div className="yorkie-devtools">
      <SeleteNodeProvider>
        <Document />
      </SeleteNodeProvider>
      <SeletedPresenceProvider>
        <Presence />
      </SeletedPresenceProvider>
    </div>
  );
};

function PanelApp() {
  return (
    <YorkieSourceProvider>
      <Panel />
    </YorkieSourceProvider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<PanelApp />);
