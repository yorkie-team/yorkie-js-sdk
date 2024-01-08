import { createRoot } from 'react-dom/client';

import { YorkieSeletedDataProvider } from '../contexts/YorkieSeletedData';
import { YorkieSourceProvider } from '../contexts/YorkieSource';
import { Document } from '../tabs/Document';
import { Presence } from '../tabs/Presence';

const Panel = () => {
  return (
    <div className="yorkie-devtools">
      <Document />
      <Presence />
    </div>
  );
};

function PanelApp() {
  return (
    <YorkieSourceProvider>
      <YorkieSeletedDataProvider>
        <Panel />
      </YorkieSeletedDataProvider>
    </YorkieSourceProvider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<PanelApp />);
