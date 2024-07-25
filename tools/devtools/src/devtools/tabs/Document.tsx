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

import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { Primitive } from 'yorkie-js-sdk';
import { RootTree } from '../components/Tree';
import { JSONDetail, TreeDetail } from '../components/Detail';
import { useSelectedNode } from '../contexts/SelectedNode';
import { useCurrentDocKey, useYorkieDoc } from '../contexts/YorkieSource';
import { CloseIcon } from '../icons';

export function Document({ style, hidePresenceTab, setHidePresenceTab }) {
  const currentDocKey = useCurrentDocKey();
  const [doc] = useYorkieDoc();
  const [selectedNode, setSelectedNode] = useSelectedNode();
  const [hideRemovedNode, setHideRemovedNode] = useState(true);
  const [root, setRoot] = useState(null);
  const [nodeDetail, setNodeDetail] = useState(null);

  useEffect(() => {
    if (!doc) return;
    // TODO(chacha912): Enhance to prevent updates when there are no changes in the root.
    setRoot(doc.toJSForTest());

    // NOTE(chacha912): When the document changes, also update the currently selected node.
    if (!selectedNode) return;
    const selectedElem = doc.getValueByPath(selectedNode.path);
    if (!selectedElem) {
      setSelectedNode(null);
      return;
    }
    setSelectedNode((prev) => ({
      ...prev,
      value: Primitive.isSupport(selectedElem)
        ? selectedElem
        : selectedElem.toJSForTest().value,
    }));
  }, [doc]);

  useEffect(() => {
    if (!doc || !selectedNode) return;
    if (selectedNode.type === 'YORKIE_TREE') {
      setNodeDetail(doc.getValueByPath(selectedNode.path).toJSInfoForTest());
    }
  }, [selectedNode]);

  return (
    <div className="yorkie-root content-wrap" style={{ ...style }}>
      <div className="devtools-tab-toolbar">
        <span className="title">{currentDocKey || 'Document'}</span>
        <button
          className="toggle-tab-btn"
          onClick={() => {
            setHidePresenceTab((v: boolean) => !v);
          }}
        >
          {hidePresenceTab ? '◂' : '▸'}
        </button>
      </div>

      <div className="content">
        <RootTree root={root} />
        {selectedNode && (
          <div
            className={classNames(
              'selected-content',
              hideRemovedNode && 'hide-removed-node',
            )}
          >
            <div className="selected-title">
              {selectedNode.id}
              <div>
                {selectedNode.type === 'YORKIE_TREE' && (
                  <button
                    className="toggle-removed-node-btn"
                    onClick={() => {
                      setHideRemovedNode((v) => !v);
                    }}
                  >
                    {hideRemovedNode
                      ? 'Show removed node'
                      : 'Hide removed node'}
                  </button>
                )}
                <button
                  className="selected-close-btn"
                  onClick={() => {
                    setSelectedNode(null);
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <div className="selected-view">
              {selectedNode.type === 'YORKIE_TREE' ? (
                <TreeDetail node={selectedNode} tree={nodeDetail} />
              ) : (
                <JSONDetail
                  json={JSON.stringify(selectedNode.value, null, 2)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
