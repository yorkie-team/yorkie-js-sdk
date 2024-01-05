import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { PanelToSDKMessage, SDKToPanelMessage } from '../../protocol';

type CurrentSourceContext = {
  currentDocKey: string | null;
  root: any;
  presences: any;
  nodeDetail: any;
};
const YorkieSourceContext = createContext<CurrentSourceContext | null>(null);

type Props = {
  children?: ReactNode;
};
const RootPath = '$';
const RootKey = 'root';
const InitialRoot = [
  {
    id: RootPath,
    path: RootPath,
    key: RootKey,
    createdAt: '0:00:0',
    type: 'YORKIE_OBJECT',
    value: {},
  },
];

export const sendMessageToTabs = async (message: PanelToSDKMessage) => {
  const [tab] = await chrome.tabs.query({
    active: true,
  });
  await chrome.tabs.sendMessage(tab.id, {
    ...message,
    source: 'yorkie-devtools-panel',
    tabId: tab.id,
  });
};

export function YorkieSourceProvider({ children }: Props) {
  const [currentDocKey, setCurrentDocKey] = useState<string | null>(null);
  const [root, setRoot] = useState(InitialRoot);
  const [presences, setPresences] = useState([]);
  const [nodeDetail, setNodeDetail] = useState(null);

  const value = useMemo(
    () => ({ currentDocKey, setCurrentDocKey, root, presences, nodeDetail }),
    [currentDocKey, setCurrentDocKey, root, presences, nodeDetail],
  );

  const handleMessage = useCallback((message: SDKToPanelMessage) => {
    console.log('✅ sdk --> content --> panel', message);
    switch (message.msg) {
      case 'doc::available':
        console.log('🎃doc available');
        setCurrentDocKey(message.docKey);
        sendMessageToTabs({
          msg: 'devtools::subscribe',
          docKey: message.docKey,
        });
        break;
      case 'doc::unavailable':
        break;
      case 'doc::sync::full':
        console.log('🎃full update');
        setRoot([
          { ...message.root, key: RootKey, id: RootPath, path: RootPath },
        ]);
        setPresences(
          message.clients.map((client) => ({
            ...client,
            id: client.clientID,
            type: 'USER',
          })),
        );
        break;
      case 'doc::sync::partial':
        console.log('🎃partial update');
        if (message.root) {
          setRoot([
            { ...message.root, key: RootKey, id: RootPath, path: RootPath },
          ]);
        }
        if (message.clients) {
          setPresences(
            message.clients.map((client) => ({
              ...client,
              id: client.clientID,
              type: 'USER',
            })),
          );
        }
        if (message.nodeDetail) {
          console.log('🎃partial update', message.nodeDetail);
          setNodeDetail(message.nodeDetail);
        }
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    sendMessageToTabs({ msg: 'devtools::connect' });
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  return (
    <YorkieSourceContext.Provider value={value}>
      {children}
    </YorkieSourceContext.Provider>
  );
}

export function useYorkieSourceContext() {
  const context = useContext(YorkieSourceContext);
  if (context === null) {
    throw new Error(
      'Please use a <YorkieSourceProvider> up the component tree to use useYorkieSourceContext()',
    );
  }
  return context;
}
