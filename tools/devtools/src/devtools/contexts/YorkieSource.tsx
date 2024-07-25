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

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DocEventType,
  type SDKToPanelMessage,
  type TransactionEvent,
} from 'yorkie-js-sdk';
import { connectPort, sendToSDK } from '../../port';

const DocKeyContext = createContext<string>(null);
const YorkieDocContext = createContext(null);
const TransactionEventsContext = createContext<{
  events: Array<TransactionEvent>;
  hidePresenceEvents: boolean;
  setHidePresenceEvents: Dispatch<SetStateAction<boolean>>;
}>(null);

type Props = {
  children?: ReactNode;
};

export function YorkieSourceProvider({ children }: Props) {
  const [currentDocKey, setCurrentDocKey] = useState<string>('');
  const [doc, setDoc] = useState(null);
  const [transactionEvents, setTransactionEvents] = useState<
    Array<TransactionEvent>
  >([]);

  // filter out presence events
  const [hideTransactionPresenceEvents, setHideTransactionPresenceEvents] =
    useState(false);

  const resetDocument = () => {
    setCurrentDocKey('');
    setTransactionEvents([]);
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
        // TODO(chacha912): Notify the user that they need to use the latest version of Yorkie-JS-SDK.
        if (message.events === undefined) break;
        setTransactionEvents(message.events);
        break;
      case 'doc::sync::partial':
        if (message.event === undefined) break;
        setTransactionEvents((events) => [...events, message.event]);
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
      <TransactionEventsContext.Provider
        value={{
          events: transactionEvents,
          hidePresenceEvents: hideTransactionPresenceEvents,
          setHidePresenceEvents: setHideTransactionPresenceEvents,
        }}
      >
        <YorkieDocContext.Provider value={[doc, setDoc]}>
          {children}
        </YorkieDocContext.Provider>
      </TransactionEventsContext.Provider>
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

export enum TransactionEventType {
  Document = 'document',
  Presence = 'presence',
}

export const getTransactionEventType = (
  event: TransactionEvent,
): TransactionEventType => {
  for (const docEvent of event) {
    if (
      docEvent.type === DocEventType.StatusChanged ||
      docEvent.type === DocEventType.Snapshot ||
      docEvent.type === DocEventType.LocalChange ||
      docEvent.type === DocEventType.RemoteChange
    ) {
      return TransactionEventType.Document;
    }
  }

  return TransactionEventType.Presence;
};

export function useTransactionEvents() {
  const { events, hidePresenceEvents, setHidePresenceEvents } = useContext(
    TransactionEventsContext,
  );

  if (events === undefined) {
    throw new Error(
      'useTransactionEvents should be used within YorkieSourceProvider',
    );
  }

  // create an enhanced events with metadata
  const enhancedEvents = useMemo(() => {
    return events.map((event) => {
      const transactionEventType = getTransactionEventType(event);

      return {
        event,
        transactionEventType,
        isFiltered:
          hidePresenceEvents &&
          transactionEventType === TransactionEventType.Presence,
      };
    });
  }, [hidePresenceEvents, events]);

  // filter out presence events from the original events
  const presenceFilteredEvents = useMemo(() => {
    if (!hidePresenceEvents) return enhancedEvents;
    return enhancedEvents.filter((e) => !e.isFiltered);
  }, [enhancedEvents]);

  return {
    originalEvents: enhancedEvents,
    presenceFilteredEvents,
    hidePresenceEvents,
    setHidePresenceEvents,
  };
}
