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

import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import yorkie from 'yorkie-js-sdk';
import { useResizable } from 'react-resizable-layout';
import { SelectedNodeProvider } from '../contexts/SelectedNode';
import { SelectedPresenceProvider } from '../contexts/SelectedPresence';
import {
  YorkieSourceProvider,
  useCurrentDocKey,
  useTransactionEvents,
  useYorkieDoc,
} from '../contexts/YorkieSource';
import { Document } from '../tabs/Document';
import { Presence } from '../tabs/Presence';
import {
  History,
  TransactionEventType,
  getTransactionEventType,
} from '../tabs/History';
import { Separator } from '../components/ResizableSeparator';

const Panel = () => {
  const currentDocKey = useCurrentDocKey();
  const events = useTransactionEvents();
  const [, setDoc] = useYorkieDoc();
  const [selectedEventIndexInfo, setSelectedEventIndexInfo] = useState({
    index: null,
    isLast: true,
  });
  const [selectedEvent, setSelectedEvent] = useState([]);
  const {
    isDragging: isHistoryDragging,
    position: historyH,
    separatorProps: historySeparatorProps,
  } = useResizable({
    axis: 'y',
    initial: 40,
  });
  const {
    isDragging: isDocumentDragging,
    position: documentW,
    separatorProps: documentSeparatorProps,
  } = useResizable({
    axis: 'x',
    initial: 300,
  });

  // filter out presence events in History tab
  const [hidePresenceEvent, setHidePresenceEvent] = useState(false);
  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (!hidePresenceEvent) {
          return true;
        }

        if (getTransactionEventType(event) === TransactionEventType.Presence) {
          return false;
        }
        return true;
      }),
    [events, hidePresenceEvent],
  );

  useEffect(() => {
    if (filteredEvents.length === 0) {
      // NOTE(chacha912): If there are no events, reset the SelectedEventIndexInfo.
      setSelectedEventIndexInfo({
        index: null,
        isLast: true,
      });
      return;
    }

    if (selectedEventIndexInfo.isLast) {
      setSelectedEventIndexInfo({
        index: filteredEvents.length - 1,
        isLast: true,
      });
    }
  }, [filteredEvents]);

  useEffect(() => {
    if (selectedEventIndexInfo.index === null) return;
    const doc = new yorkie.Document(currentDocKey);
    for (let i = 0; i <= selectedEventIndexInfo.index; i++) {
      doc.applyTransactionEvent(filteredEvents[i]);
    }

    setDoc(doc);
    setSelectedEvent(filteredEvents[selectedEventIndexInfo.index]);
  }, [selectedEventIndexInfo]);

  if (!currentDocKey) {
    return (
      <div className="yorkie-devtools-empty">
        <p className="empty-title">Yorkie is not found in this page.</p>
        <p className="empty-desc">
          If this seems wrong, try reloading the page.
          <br />
          The current Devtools requires yorkie-js-sdk v0.4.18 or newer in a
          development build.
        </p>
        <button
          className="reload-btn"
          onClick={() => {
            chrome.tabs.reload(chrome.devtools.inspectedWindow.tabId);
          }}
        >
          Reload
        </button>
      </div>
    );
  }

  return (
    <div className="yorkie-devtools">
      <History
        style={{ height: historyH }}
        selectedEvent={selectedEvent}
        selectedEventIndexInfo={selectedEventIndexInfo}
        setSelectedEventIndexInfo={setSelectedEventIndexInfo}
        hidePresenceEvent={hidePresenceEvent}
        setHidePresenceEvent={setHidePresenceEvent}
        events={filteredEvents}
      />

      <Separator
        dir={'horizontal'}
        isDragging={isHistoryDragging}
        {...historySeparatorProps}
      />

      <div className="devtools-data">
        <SelectedNodeProvider>
          <Document
            style={{
              width: documentW,
            }}
          />
        </SelectedNodeProvider>

        <Separator
          isDragging={isDocumentDragging}
          {...documentSeparatorProps}
        />

        <SelectedPresenceProvider>
          <Presence />
        </SelectedPresenceProvider>
      </div>
    </div>
  );
};

function PanelApp() {
  return (
    <YorkieSourceProvider>
      <Panel />
    </YorkieSourceProvider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<PanelApp />);
