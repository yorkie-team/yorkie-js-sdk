import classNames from 'classnames';
import { useState } from 'react';

import { Code } from './Code';
import { CodeIcon, GraphIcon } from '../icons';

export function JSONDetail({ json }) {
  return <Code code={json} language="json" withLineNumbers />;
}

const TreeNode = ({ node }) => {
  if (node.type === 'text') {
    const depth = node.index === 0 ? node.depth : 0;
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
};

const TreeGraph = ({ tree }) => {
  const flattenTreeWithDepth = (node, depth = 0, i = 0) => {
    const flattenedNode = { ...node, depth, index: i };

    const children = (node.children || []).flatMap((child, i) =>
      flattenTreeWithDepth(child, depth + 1, i),
    );

    return [flattenedNode, ...children];
  };

  return flattenTreeWithDepth(tree).map((node) => (
    <TreeNode key={node.id} node={node} />
  ));
};

export function TreeDetail({ node, tree }) {
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
