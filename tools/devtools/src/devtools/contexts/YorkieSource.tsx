/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import type { Devtools, SDKToPanelMessage } from 'yorkie-js-sdk';
import { onPortMessage, sendToSDK } from '../../port';

const DocKeyContext = createContext<string | null>(null);
const RootContext = createContext<Devtools.JSONElement | null>(null);
const PresencesContext = createContext<Array<Devtools.Client> | null>(null);
const NodeDetailContext = createContext<Devtools.TreeNodeInfo | null>(null);

type Props = {
  children?: ReactNode;
};

export function YorkieSourceProvider({ children }: Props) {
  const [currentDocKey, setCurrentDocKey] = useState<string>('');
  const [root, setRoot] = useState<Devtools.JSONElement>(null);
  const [presences, setPresences] = useState<Array<Devtools.Client>>([]);
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
