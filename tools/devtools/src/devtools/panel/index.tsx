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
import { useEffect } from 'react';
import yorkie, { converter } from 'yorkie-js-sdk';

import { SeleteNodeProvider } from '../contexts/SeletedNode';
import { SeletedPresenceProvider } from '../contexts/SeletedPresence';
import {
  YorkieSourceProvider,
  useCurrentDocKey,
  useYorkieChanges,
  useYorkieDoc,
} from '../contexts/YorkieSource';
import { Document } from '../tabs/Document';
import { Presence } from '../tabs/Presence';

const Panel = () => {
  const currentDocKey = useCurrentDocKey();
  const changes = useYorkieChanges();
  const [, setDoc] = useYorkieDoc();

  useEffect(() => {
    if (changes.length > 0) {
      // NOTE(chacha912): Build the document of the last operation in the last change.
      const selected = changes.at(-1).at(-1);
      const snapshot = converter.hexToBytes(selected.snapshot);
      const doc = yorkie.Document.createFromSnapshot(currentDocKey, snapshot);
      if (selected.clientID !== '000000000000000000000000') {
        doc.setActor(selected.clientID);
        doc.setStatus('attached');
      }
      setDoc(doc);
    }
  }, [changes]);

  if (!currentDocKey) {
    return (
      <div className="yorkie-devtools-empty">
        <p className="empty-title">Yorkie is not found in this page.</p>
        <p className="empty-desc">
          If this seems wrong, try reloading the page.
          <br /> Requires a development build of yorkie-js-sdk v0.4.13 or newer.
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
      <SeleteNodeProvider>
        <Document />
      </SeleteNodeProvider>
      <SeletedPresenceProvider>
        <Presence />
      </SeletedPresenceProvider>
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
