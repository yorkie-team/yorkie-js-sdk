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

import { RootTree } from '../components/Tree';
import { JSONDetail, TreeDetail } from '../components/Detail';
import { useSeletedNode } from '../contexts/SeletedNode';
import {
  useCurrentDocKey,
  useDocumentRoot,
  useNodeDetail,
} from '../contexts/YorkieSource';
import { CloseIcon } from '../icons';

export function Document() {
  const currentDocKey = useCurrentDocKey();
  const root = useDocumentRoot();
  const nodeDetail = useNodeDetail();
  const [selectedNode, setSelectedNode] = useSeletedNode();

  return (
    <div className="yorkie-root content-wrap">
      <div className="title">{currentDocKey || 'Document'}</div>
      <div className="content">
        <RootTree root={root} />
        {selectedNode && (
          <div className="selected-content">
            <div className="selected-title">
              {selectedNode.id}
              <button
                className="selected-close-btn"
                onClick={() => {
                  setSelectedNode(null);
                }}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="selected-view">
              {selectedNode.type === 'YORKIE_TREE' ? (
                <TreeDetail node={selectedNode} tree={nodeDetail} />
              ) : (
                <JSONDetail
                  json={JSON.stringify(selectedNode?.value, null, 2)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
