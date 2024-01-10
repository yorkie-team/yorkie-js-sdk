import { createRoot } from 'react-dom/client';

import { SeleteNodeProvider } from '../contexts/SeletedNode';
import { SeletedPresenceProvider } from '../contexts/SeletedPresence';
import { YorkieSourceProvider } from '../contexts/YorkieSource';
import { Document } from '../tabs/Document';
import { Presence } from '../tabs/Presence';

const Panel = () => {
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
