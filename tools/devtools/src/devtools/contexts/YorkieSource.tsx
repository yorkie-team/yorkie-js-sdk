import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import type {
  JSONElement,
  Client,
  SDKToPanelMessage,
  TreeNodeInfo,
} from '../../protocol';
import { onPortMessage, sendToSDK } from '../../port';

const DocKeyContext = createContext<string | null>(null);
const RootContext = createContext<JSONElement | null>(null);
const PresencesContext = createContext<Array<Client> | null>(null);
const NodeDetailContext = createContext<TreeNodeInfo | null>(null);

type Props = {
  children?: ReactNode;
};

export function YorkieSourceProvider({ children }: Props) {
  const [currentDocKey, setCurrentDocKey] = useState<string>('');
  const [root, setRoot] = useState<JSONElement>(null);
  const [presences, setPresences] = useState<Array<Client>>([]);
  const [nodeDetail, setNodeDetail] = useState(null);

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
        setRoot(message.root);
        setPresences(message.clients);
        break;
      case 'doc::sync::partial':
        if (message.root) {
          setRoot(message.root);
        }
        if (message.clients) {
          setPresences(message.clients);
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
  if (value === undefined) {
    throw new Error(
      'useCurrentDocKey should be used within YorkieSourceProvider',
    );
  }
  return value;
}

export function useDocumentRoot() {
  const value = useContext(RootContext);
  if (value === undefined) {
    throw new Error(
      'useDocumentRoot should be used within YorkieSourceProvider',
    );
  }
  return value;
}

export function usePresences() {
  const value = useContext(PresencesContext);
  if (value === undefined) {
    throw new Error('usePresences should be used within YorkieSourceProvider');
  }
  return value;
}

export function useNodeDetail() {
  const value = useContext(NodeDetailContext);
  if (value === undefined) {
    throw new Error('useNodeDetail should be used within YorkieSourceProvider');
  }
  return value;
}
