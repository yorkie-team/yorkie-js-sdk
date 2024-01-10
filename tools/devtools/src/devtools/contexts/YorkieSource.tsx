import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  ElementType,
  ElementValue,
  Json,
  SDKToPanelMessage,
} from '../../protocol';
import { onPortMessage, sendToSDK } from '../../port';

type CurrentSourceContext = {
  currentDocKey: string | null;
  root: Array<RootTreeNode>;
  presences: Array<PresenceTreeNode>;
  nodeDetail: any;
};
export type RootTreeNode = {
  id: string;
  path: string;
  key: string;
  createdAt: string;
  value: ElementValue;
  type: ElementType;
};
export type PresenceTreeNode =
  | {
      clientID: string;
      presence: Json;
      id: string;
      type: 'USER';
    }
  | {
      id: string;
      key: string;
      value: Json;
      isLastChild: boolean;
      type: 'JSON';
    };
const YorkieSourceContext = createContext<CurrentSourceContext | null>(null);

type Props = {
  children?: ReactNode;
};
const RootPath = '$';
const RootKey = 'root';
const InitialRoot: Array<RootTreeNode> = [
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
  const [presences, setPresences] = useState<Array<PresenceTreeNode>>([]);
  const [nodeDetail, setNodeDetail] = useState(null);

  const value = useMemo(
    () => ({ currentDocKey, setCurrentDocKey, root, presences, nodeDetail }),
    [currentDocKey, setCurrentDocKey, root, presences, nodeDetail],
  );

  const handleSDKMessage = useCallback((message: SDKToPanelMessage) => {
    switch (message.msg) {
      case 'doc::available':
        setCurrentDocKey(message.docKey);
        sendToSDK({
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
        break;
      case 'doc::node::detail':
        setNodeDetail(message.node);
        break;
    }
  }, []);

  useEffect(() => {
    sendToSDK({ msg: 'devtools::connect' });
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
