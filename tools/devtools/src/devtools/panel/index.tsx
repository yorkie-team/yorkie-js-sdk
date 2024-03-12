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
import { useEffect, useState } from 'react';
import yorkie from 'yorkie-js-sdk';
import { useResizable } from 'react-resizable-layout';

import { SelectedNodeProvider } from '../contexts/SelectedNode';
import { SelectedPresenceProvider } from '../contexts/SelectedPresence';
import {
  YorkieSourceProvider,
  useCurrentDocKey,
  useYorkieChanges,
  useYorkieDoc,
  applyHistoryChangePack,
} from '../contexts/YorkieSource';
import { Document } from '../tabs/Document';
import { Presence } from '../tabs/Presence';
import { History } from '../tabs/History';
import { Separator } from '../components/ResizableSeparator';

const Panel = () => {
  const currentDocKey = useCurrentDocKey();
  const changes = useYorkieChanges();
  const [, setDoc] = useYorkieDoc();
  const [selectedChangeIndexInfo, setSelectedChangeIndexInfo] = useState({
    index: null,
    isLast: true,
  });
  const [selectedChangeInfo, setSelectedChangeInfo] = useState(null);
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

  useEffect(() => {
    if (changes.length > 0 && selectedChangeIndexInfo.isLast) {
      setSelectedChangeIndexInfo({
        index: changes.length - 1,
        isLast: true,
      });
    }
  }, [changes]);

  useEffect(() => {
    if (selectedChangeIndexInfo.index === null) return;
    const doc = new yorkie.Document(currentDocKey);
    for (let i = 0; i < selectedChangeIndexInfo.index; i++) {
      applyHistoryChangePack(doc, changes[i]);
    }

    const change = changes[selectedChangeIndexInfo.index];
    const info = applyHistoryChangePack(doc, change);

    setDoc(doc);
    setSelectedChangeInfo(info);
  }, [selectedChangeIndexInfo]);

  if (!currentDocKey) {
    return (
      <div className="yorkie-devtools-empty">
        <p className="empty-title">Yorkie is not found in this page.</p>
        <p className="empty-desc">
          If this seems wrong, try reloading the page.
          <br />
          The current Devtools requires yorkie-js-sdk v0.4.16 or newer in a
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
        selectedChangeInfo={selectedChangeInfo}
        selectedChangeIndexInfo={selectedChangeIndexInfo}
        setSelectedChangeIndexInfo={setSelectedChangeIndexInfo}
      />
      <Separator
        dir={'horizontal'}
        isDragging={isHistoryDragging}
        {...historySeparatorProps}
      />
      <div className="devtools-data">
        <SelectedNodeProvider>
          <Document style={{ width: documentW }} />
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
