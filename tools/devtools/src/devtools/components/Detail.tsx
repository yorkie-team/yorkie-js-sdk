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
import type { Devtools } from 'yorkie-js-sdk';

type FlatTreeNodeInfo = Devtools.TreeNodeInfo & {
  depth: number;
  childIndex: number;
};

function TreeNode({ node }: { node: FlatTreeNodeInfo }) {
  if (node.type === 'text') {
    // NOTE(chacha912): The 'depth' variable is used for styling purposes.
    // For 'text' nodes, when they are not the first child node, 'depth' is
    // set to 0 to ensure they are displayed on the same line.
    const depth = node.childIndex === 0 ? node.depth : 0;

    return (
      <div
        className={classNames('tree-node', 'text')}
        style={{ '--depth': depth } as any}
      >
        <span className="node-item">
          <span>{node.value}</span>
          <span className="timeticket">{node.id}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={classNames('tree-node')}
      style={{ '--depth': node.depth } as any}
    >
      <span className="node-item">
        <span>{node.type}</span>
        <span className="timeticket">{node.id}</span>
      </span>
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
  const [viewType, setViewType] = useState<'json' | 'graph'>('json');

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
