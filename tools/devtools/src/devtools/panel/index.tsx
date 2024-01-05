import classNames from 'classnames';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Code } from '../components/Code';
import { PresenceTree, RootTree } from '../components/Tree';
import {
  useYorkieSeletedDataContext,
  YorkieSeletedDataProvider,
} from '../contexts/YorkieSeletedData';
import {
  useYorkieSourceContext,
  YorkieSourceProvider,
} from '../contexts/YorkieSource';
import { CloseIcon, CodeIcon, GraphIcon } from '../icons';

const TreeNode = ({ node, setSelectedTreeNode, selectedTreeNode }) => {
  if (node.type === 'text') {
    const depth = node.index === 0 ? node.depth : 0;
    return (
      <div
        className={classNames(
          'tree-node',
          'text',
          selectedTreeNode?.id === node.id && 'is-selected',
        )}
        style={{ '--depth': depth } as any}
      >
        <span
          className="node-item"
          onClick={() => {
            setSelectedTreeNode(node);
          }}
        >
          <span>{node.value}</span>
          <span className="timeticket">{node.id}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={classNames(
        'tree-node',
        selectedTreeNode?.id === node.id && 'is-selected',
      )}
      style={{ '--depth': node.depth } as any}
    >
      <span
        className="node-item"
        onClick={() => {
          setSelectedTreeNode(node);
        }}
      >
        <span>{node.type}</span>
        <span className="timeticket">{node.id}</span>
      </span>
    </div>
  );
};

const TreeView = ({ tree }) => {
  const [selectedTreeNode, setSelectedTreeNode] = useState(null);
  const flattenTreeWithDepth = (node, depth = 0, i = 0) => {
    const flattenedNode = { ...node, depth, index: i };

    const children = (node.children || []).flatMap((child, i) =>
      flattenTreeWithDepth(child, depth + 1, i),
    );

    return [flattenedNode, ...children];
  };

  return flattenTreeWithDepth(tree).map((node) => (
    <TreeNode
      key={node.id}
      node={node}
      selectedTreeNode={selectedTreeNode}
      setSelectedTreeNode={setSelectedTreeNode}
    />
  ));
};

const TreeDetail = ({ node, tree }) => {
  const [viewType, setViewType] = useState('data');

  return (
    <div className="selected-view-tab">
      <div className="selected-view-tabmenu">
        <button
          className={classNames(
            'selected-view-btn',
            viewType === 'data' && 'is-selected',
          )}
          onClick={() => {
            setViewType('data');
          }}
        >
          <CodeIcon />
        </button>
        <button
          className={classNames(
            'selected-view-btn',
            viewType === 'tree' && 'is-selected',
          )}
          onClick={() => {
            setViewType('tree');
          }}
        >
          <GraphIcon />
        </button>
      </div>
      {viewType === 'data' && (
        <Code
          code={JSON.stringify(node.value, null, 2)}
          language="json"
          withLineNumbers
        />
      )}
      {viewType === 'tree' && tree && <TreeView tree={tree} />}
    </div>
  );
};

const Panel = () => {
  const { currentDocKey, root, presences, nodeDetail } =
    useYorkieSourceContext();
  const {
    selectedPresence,
    setSelectedPresence,
    selectedNode,
    setSelectedNode,
  } = useYorkieSeletedDataContext();

  return (
    <div className="yorkie-devtools">
      <div className="yorkie-root content-wrap">
        <div className="title">{currentDocKey || 'Document'}</div>
        <div className="content">
          <RootTree data={root} />
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
                  <Code
                    code={JSON.stringify(selectedNode?.value, null, 2)}
                    language="json"
                    withLineNumbers
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="yorkie-presence content-wrap">
        <div className="title">Presence</div>
        <div className="content">
          <PresenceTree data={presences} />
          {selectedPresence && (
            <div className="selected-content">
              <div className="selected-title">
                {selectedPresence.key}
                <button
                  className="selected-close-btn"
                  onClick={() => {
                    setSelectedPresence(null);
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
              <Code
                code={JSON.stringify(selectedPresence.value, null, 2)}
                language="json"
                withLineNumbers
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function PanelApp() {
  return (
    <YorkieSourceProvider>
      <YorkieSeletedDataProvider>
        <Panel />
      </YorkieSeletedDataProvider>
    </YorkieSourceProvider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<PanelApp />);
