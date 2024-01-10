import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import type {
  ElementType,
  ElementValue,
  Json,
  SDKToPanelMessage,
  TreeNodeInfo,
} from '../../protocol';
import { onPortMessage, sendToSDK } from '../../port';

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

const DocKeyContext = createContext<string | null>(null);
const RootContext = createContext<Array<RootTreeNode> | null>(null);
const PresencesContext = createContext<Array<PresenceTreeNode> | null>(null);
const NodeDetailContext = createContext<{ nodeDetail: TreeNodeInfo } | null>(
  null,
);

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
  const [currentDocKey, setCurrentDocKey] = useState<string>('');
  const [root, setRoot] = useState(InitialRoot);
  const [presences, setPresences] = useState<Array<PresenceTreeNode>>([]);
  const [nodeDetail, setNodeDetail] = useState({ nodeDetail: null });

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
        setNodeDetail({ nodeDetail: message.node });
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
    <DocKeyContext.Provider value={currentDocKey}>
      <RootContext.Provider value={root}>
        <PresencesContext.Provider value={presences}>
          <NodeDetailContext.Provider value={nodeDetail}>
            {children}
          </NodeDetailContext.Provider>
        </PresencesContext.Provider>
      </RootContext.Provider>
    </DocKeyContext.Provider>
  );
}

export function useCurrentDocKey() {
  const value = useContext(DocKeyContext);
  if (value === null) {
    throw new Error(
      'useCurrentDocKey should be used within YorkieSourceProvider',
    );
  }
  return value;
}

export function useDocumentRoot() {
  const value = useContext(RootContext);
  if (value === null) {
    throw new Error(
      'useDocumentRoot should be used within YorkieSourceProvider',
    );
  }
  return value;
}

export function usePresences() {
  const value = useContext(PresencesContext);
  if (value === null) {
    throw new Error('usePresences should be used within YorkieSourceProvider');
  }
  return value;
}

export function useNodeDetail() {
  const value = useContext(NodeDetailContext);
  if (value === null) {
    throw new Error('useNodeDetail should be used within YorkieSourceProvider');
  }
  return value;
}
