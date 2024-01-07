import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { SDKToPanelMessage } from '../../protocol';
import { onPortMessage, sendMessageToTab } from '../../port';

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

export function YorkieSourceProvider({ children }: Props) {
  const [currentDocKey, setCurrentDocKey] = useState<string | null>(null);
  const [root, setRoot] = useState(InitialRoot);
  const [presences, setPresences] = useState([]);
  const [nodeDetail, setNodeDetail] = useState(null);

  const value = useMemo(
    () => ({ currentDocKey, setCurrentDocKey, root, presences, nodeDetail }),
    [currentDocKey, setCurrentDocKey, root, presences, nodeDetail],
  );

  const handleSDKMessage = useCallback((message: SDKToPanelMessage) => {
    switch (message.msg) {
      case 'doc::available':
        setCurrentDocKey(message.docKey);
        sendMessageToTab({
          msg: 'devtools::subscribe',
          docKey: message.docKey,
        });
        break;
      case 'doc::sync::full':
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
          setNodeDetail(message.nodeDetail);
        }
        break;
    }
  }, []);

  useEffect(() => {
    sendMessageToTab({ msg: 'devtools::connect' });
    onPortMessage.addListener(handleSDKMessage);
    return () => {
      onPortMessage.removeListener(handleSDKMessage);
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
