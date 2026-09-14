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
  useRef,
  useState,
} from 'react';

import { DocEventType, Devtools, type SDKToPanelMessage } from '@yorkie-js/sdk';
import { connectPort, sendToSDK } from '../../port';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

const DocKeyContext = createContext<string>(null);
const DocListContext = createContext<{
  docKeys: Array<string>;
  selectDocument: (docKey: string) => void;
}>(null);
const YorkieDocContext = createContext(null);
const DocEventsForReplayContext = createContext<{
  events: Array<Devtools.DocEventsForReplay>;
  hidePresenceEvents: boolean;
  setHidePresenceEvents: Dispatch<SetStateAction<boolean>>;
}>(null);

type Props = {
  children?: ReactNode;
};

/**
 * Provides the current document key and events for replay.
 *
 * @param props.children - React elements that consume the document context.
 * @returns A context provider wrapping the given children.
 */
export function YorkieSourceProvider({ children }: Props) {
  const [currentDocKey, setCurrentDocKey] = useState<string>('');
  // NOTE(hackerwins): `handleSDKMessage` is registered once per port, so it
  // cannot read `currentDocKey` from the closure. The ref mirrors the state.
  const currentDocKeyRef = useRef<string>('');
  const [docKeys, setDocKeys] = useState<Array<string>>([]);
  const [doc, setDoc] = useState(null);
  const [docEventsForReplay, setDocEventsForReplay] = useState<
    Array<Devtools.DocEventsForReplay>
  >([]);

  // filter out presence events
  const [hidePresenceEvents, setHidePresenceEvents] = useState(false);

  const resetDocument = () => {
    currentDocKeyRef.current = '';
    setCurrentDocKey('');
    setDocKeys([]);
    setDocEventsForReplay([]);
    setDoc(null);
  };

  const selectDocument = useCallback((docKey: string) => {
    currentDocKeyRef.current = docKey;
    setCurrentDocKey(docKey);
    setDocEventsForReplay([]);
    setDoc(null);
    sendToSDK({ msg: 'devtools::subscribe', docKey });
  }, []);

  const handleSDKMessage = useCallback(
    (message: SDKToPanelMessage) => {
      switch (message.msg) {
        case 'refresh-devtools':
          resetDocument();
          sendToSDK({ msg: 'devtools::connect' });
          break;
        case 'doc::available':
          setDocKeys((keys) =>
            keys.includes(message.docKey) ? keys : [...keys, message.docKey],
          );
          if (!currentDocKeyRef.current) {
            // NOTE(hackerwins): Adopt the first document that announces itself,
            // and keep the user's choice when another one shows up later.
            selectDocument(message.docKey);
          } else if (currentDocKeyRef.current === message.docKey) {
            // NOTE(hackerwins): A document re-announces itself on every
            // `devtools::connect`, which the panel re-issues whenever the
            // inspected tab finishes loading. Resetting here would throw away the
            // history position the user is looking at, so only re-subscribe.
            sendToSDK({
              msg: 'devtools::subscribe',
              docKey: message.docKey,
            });
          }
          break;
        case 'doc::sync::full':
          // NOTE(hackerwins): An SDK that ignores the subscribed key answers for
          // every document on the page. Drop what the panel did not ask for.
          if (message.docKey !== currentDocKeyRef.current) break;
          // TODO(chacha912): Notify the user that they need to use the latest version of Yorkie-JS-SDK.
          if (message.events === undefined) break;
          setDocEventsForReplay(message.events);
          break;
        case 'doc::sync::partial':
          if (message.docKey !== currentDocKeyRef.current) break;
          if (message.event === undefined) break;
          setDocEventsForReplay((events) => [...events, message.event]);
          break;
      }
    },
    [selectDocument],
  );

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

  const docList = useMemo(
    () => ({ docKeys, selectDocument }),
    [docKeys, selectDocument],
  );

  return (
    <DocKeyContext.Provider value={currentDocKey}>
      <DocListContext.Provider value={docList}>
        <DocEventsForReplayContext.Provider
          value={{
            events: docEventsForReplay,
            hidePresenceEvents,
            setHidePresenceEvents,
          }}
        >
          <YorkieDocContext.Provider value={[doc, setDoc]}>
            {children}
          </YorkieDocContext.Provider>
        </DocEventsForReplayContext.Provider>
      </DocListContext.Provider>
    </DocKeyContext.Provider>
  );
}

/**
 * Hook to access the current document key.
 *
 * @throws YorkieError if called outside of a YorkieSourceProvider.
 * @returns The current document key.
 */
export function useCurrentDocKey() {
  const value = useContext(DocKeyContext);
  if (value === undefined) {
    throw new YorkieError(
      Code.ErrContextNotProvided,
      'useCurrentDocKey should be used within YorkieSourceProvider',
    );
  }
  return value;
}

/**
 * Hook to access the documents found in the page and to switch between them.
 *
 * @throws YorkieError if called outside of a YorkieSourceProvider.
 * @returns The available document keys and a function to select one of them.
 */
export function useDocList() {
  const value = useContext(DocListContext);
  if (value === undefined) {
    throw new YorkieError(
      Code.ErrContextNotProvided,
      'useDocList should be used within YorkieSourceProvider',
    );
  }
  return value;
}

/**
 * Hook to access the current Yorkie document.
 *
 * @throws YorkieError if called outside of a YorkieSourceProvider.
 * @returns The current Yorkie document.
 */
export function useYorkieDoc() {
  const value = useContext(YorkieDocContext);
  if (value === undefined) {
    throw new YorkieError(
      Code.ErrContextNotProvided,
      'useYorkieDoc should be used within YorkieSourceProvider',
    );
  }
  return value;
}

/**
 * `DocEventScope` represents the scope of the document event.
 */
export enum DocEventScope {
  Root = 'root',
  Presence = 'presence',
  Document = 'document',
}

export const getDocEventsScope = (
  events: Devtools.DocEventsForReplay,
): DocEventScope => {
  for (const e of events) {
    if (
      e.type === DocEventType.Snapshot ||
      e.type === DocEventType.LocalChange ||
      e.type === DocEventType.RemoteChange
    ) {
      return DocEventScope.Root;
    } else if (e.type === DocEventType.StatusChanged) {
      return DocEventScope.Document;
    }
  }

  return DocEventScope.Presence;
};

/**
 * Hook to access and manipulate document events for replay.
 *
 * @throws YorkieError if called outside of a YorkieSourceProvider.
 * @returns An object containing the original events, filtered events, and methods to control filtering.
 */
export function useDocEventsForReplay() {
  const { events, hidePresenceEvents, setHidePresenceEvents } = useContext(
    DocEventsForReplayContext,
  );

  if (events === undefined) {
    throw new YorkieError(
      Code.ErrContextNotProvided,
      'useDocEventsForReplay should be used within YorkieSourceProvider',
    );
  }

  // create an enhanced events with metadata
  const enhancedEvents = useMemo(() => {
    return events.map((event) => {
      const scope = getDocEventsScope(event);

      return {
        event,
        scope,
        isFiltered: hidePresenceEvents && scope === DocEventScope.Presence,
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
