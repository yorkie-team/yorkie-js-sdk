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

import classNames from 'classnames';
import { useState, useCallback } from 'react';

import { Code } from './Code';
import type { RootTreeNode } from './Tree';
import { CodeIcon, GraphIcon } from '../icons';
import type { Devtools, CRDTTreeNodeIDStruct } from 'yorkie-js-sdk';

type FlatTreeNodeInfo = Devtools.TreeNodeInfo & {
  depth: number;
  childIndex: number;
};

/**
 * `nodeIDToString` converts the given CRDTTreeNodeIDStruct to a simple string.
 */
const nodeIDToString = (id: CRDTTreeNodeIDStruct) => {
  const {
    createdAt: { actorID, lamport, delimiter },
    offset,
  } = id;
  return `${lamport}:${actorID.slice(-2)}:${delimiter}/${offset}`;
};

function TreeNode({ node }: { node: FlatTreeNodeInfo }) {
  // NOTE(chacha912): The 'depth' variable is used for styling purposes.
  // For 'text' nodes, when they are not the first child node, 'depth' is
  // set to 0 to ensure they are displayed on the same line.
  const depth =
    node.type === 'text'
      ? node.childIndex === 0
        ? node.depth
        : 0
      : node.depth;

  return (
    <div
      className={classNames(
        'tree-node',
        node.type === 'text' && 'text',
        node.isRemoved && 'removed',
      )}
      style={{ '--depth': depth } as any}
    >
      <span className="node-item">
        <span>{node.type === 'text' ? node.value : node.type}</span>
        <span className="timeticket">{node.id}</span>
      </span>
      <div className="node-tooltip">
        <div>
          <span className="title">index: </span>
          <span className="desc">{node.index}</span>
        </div>
        <div>
          <span className="title">path: </span>
          <span className="desc">{JSON.stringify(node.path)}</span>
        </div>
        <div>
          <span className="title">pos: </span>
          <span className="desc">
            {node.pos &&
              `[${nodeIDToString(node.pos.parentID)},
            ${nodeIDToString(node.pos.leftSiblingID)}]`}
          </span>
        </div>
        <div>
          <span className="title">size: </span>
          <span className="desc">{node.size}</span>
        </div>
        {node.type !== 'text' && (
          <div>
            <span className="title">attrs: </span>
            <span className="desc">{JSON.stringify(node.attributes)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TreeGraph({ tree }: { tree: Devtools.TreeNodeInfo }) {
  const flattenTreeWithDepth = useCallback(
    (
      node: Devtools.TreeNodeInfo,
      depth = 0,
      i = 0,
    ): Array<FlatTreeNodeInfo> => {
      const nodeWithDepth = { ...node, depth, childIndex: i };
      const children = (node.children || []).flatMap((child, i) =>
        flattenTreeWithDepth(child, depth + 1, i),
      );
      return [nodeWithDepth, ...children];
    },
    [],
  );

  return flattenTreeWithDepth(tree).map((node) => (
    <TreeNode key={node.id} node={node} />
  ));
}

export function TreeDetail({
  node,
  tree,
}: {
  node: RootTreeNode;
  tree: Devtools.TreeNodeInfo;
}) {
  const [viewType, setViewType] = useState<'json' | 'graph'>('graph');

  return (
    <div className="selected-view-tab">
      <div className="selected-view-tabmenu">
        <button
          className={classNames(
            'selected-view-btn',
            viewType === 'json' && 'is-selected',
          )}
          onClick={() => {
            setViewType('json');
          }}
        >
          <CodeIcon />
        </button>
        <button
          className={classNames(
            'selected-view-btn',
            viewType === 'graph' && 'is-selected',
          )}
          onClick={() => {
            setViewType('graph');
          }}
        >
          <GraphIcon />
        </button>
      </div>
      {viewType === 'json' && (
        <JSONDetail json={JSON.stringify(node.value, null, 2)} />
      )}
      {viewType === 'graph' && tree && <TreeGraph tree={tree} />}
    </div>
  );
}

export function JSONDetail({ json }: { json: string }) {
  return <Code code={json ?? ''} language="json" withLineNumbers />;
}
