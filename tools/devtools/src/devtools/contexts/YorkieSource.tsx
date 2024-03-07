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

import type { SDKToPanelMessage, DocEvent } from 'yorkie-js-sdk';
import { Devtools, converter, Change, Long } from 'yorkie-js-sdk';
import { connectPort, sendToSDK } from '../../port';

const DocKeyContext = createContext<string>(null);
const YorkieDocContext = createContext(null);
const YorkieChangesContext = createContext<Array<HistoryChangePackInfo>>(null);

type Props = {
  children?: ReactNode;
};

type HistoryChangePackInfo = Devtools.HistoryChangePack & {
  event?: DocEvent;
  docMeta?: {
    myClientID: string;
    docStatus: string;
    onlineClients: Array<string>;
    snapshot: string;
    docKey: string;
  };
};

export function applyHistoryChangePack(
  doc,
  changePack: Devtools.HistoryChangePack,
) {
  let result;
  switch (changePack.type) {
    case Devtools.HistoryChangePackType.Snapshot:
      const { snapshot, serverSeq } = changePack.payload;
      result = doc.applySnapshot(
        Long.fromString(serverSeq),
        converter.hexToBytes(snapshot),
      );
      return {
        event: result.event,
        changePack: { type: changePack.type },
      };
    case Devtools.HistoryChangePackType.Change:
      const { changeID, operations, presenceChange, message } =
        changePack.payload;
      const change = Change.create({
        id: converter.bytesToChangeID(converter.hexToBytes(changeID)),
        operations: operations.map((op) => {
          return converter.bytesToOperation(converter.hexToBytes(op));
        }),
        presenceChange: presenceChange as any,
        message,
      });
      result = doc.applyChange(change, changePack.source);
      return {
        event: result.event,
        changePack: {
          type: changePack.type,
          payload: {
            actor: change.getID().getActorID(),
            operations: change.getOperations().map((op) => {
              // TODO(chacha912): Enhance to show the operation structure.
              return {
                desc: op.toTestString(),
                executedAt: op.getExecutedAt().toTestString(),
              };
            }),
            presenceChange: change.getPresenceChange(),
            message: change.getMessage(),
          },
        },
      };
    case Devtools.HistoryChangePackType.WatchStream:
      result = doc.applyWatchStream(changePack.payload);
      return {
        event: result.event,
        changePack: { type: changePack.type, payload: changePack.payload },
      };
    case Devtools.HistoryChangePackType.DocStatus:
      result = doc.applyDocStatus(changePack.payload);
      return {
        event: result.event,
        changePack: { type: changePack.type, payload: changePack.payload },
      };
  }
}

export function YorkieSourceProvider({ children }: Props) {
  const [currentDocKey, setCurrentDocKey] = useState<string>('');
  const [doc, setDoc] = useState(null);
  const [historyChanges, setHistoryChanges] = useState<
    Array<HistoryChangePackInfo>
  >([]);

  const resetDocument = () => {
    setCurrentDocKey('');
    setHistoryChanges([]);
    setDoc(null);
  };

  const handleSDKMessage = useCallback((message: SDKToPanelMessage) => {
    switch (message.msg) {
      case 'refresh-devtools':
        resetDocument();
        sendToSDK({ msg: 'devtools::connect' });
        break;
      case 'doc::available':
        setCurrentDocKey(message.docKey);
        sendToSDK({
          msg: 'devtools::subscribe',
          docKey: message.docKey,
        });
        break;
      case 'doc::sync::full':
        // TODO(chacha912): Notify the user that they need to use Yorkie-JS-SDK version 0.4.15 or newer.
        if (message.changes === undefined) break;
        setHistoryChanges(message.changes);
        break;
      case 'doc::sync::partial':
        if (message.changes === undefined) break;
        setHistoryChanges((changes) => [...changes, ...message.changes]);
        break;
    }
  }, []);

  const handlePortDisconnect = useCallback(() => {
    resetDocument();
  }, [resetDocument]);

  useEffect(() => {
    connectPort(handleSDKMessage, handlePortDisconnect);

    const tabID = chrome.devtools.inspectedWindow.tabId;
    const handleInspectedTabUpdate = (id, { status }) => {
      // NOTE(chacha912): The inspected window is reloaded, so we should reconnect the port.
      if (status === 'complete' && tabID === id) {
        connectPort(handleSDKMessage, handlePortDisconnect);
      }
    };
    chrome.tabs.onUpdated.addListener(handleInspectedTabUpdate);
    return () => {
      chrome.tabs.onUpdated.removeListener(handleInspectedTabUpdate);
    };
  }, []);

  return (
    <DocKeyContext.Provider value={currentDocKey}>
      <YorkieChangesContext.Provider value={historyChanges}>
        <YorkieDocContext.Provider value={[doc, setDoc]}>
          {children}
        </YorkieDocContext.Provider>
      </YorkieChangesContext.Provider>
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

export function useYorkieDoc() {
  const value = useContext(YorkieDocContext);
  if (value === undefined) {
    throw new Error('useYorkieDoc should be used within YorkieSourceProvider');
  }
  return value;
}

export function useYorkieChanges() {
  const value = useContext(YorkieChangesContext);
  if (value === undefined) {
    throw new Error(
      'useYorkieChanges should be used within YorkieSourceProvider',
    );
  }
  return value;
}
