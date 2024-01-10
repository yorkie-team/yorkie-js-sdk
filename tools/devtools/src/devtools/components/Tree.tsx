import classNames from 'classnames';
import { useEffect } from 'react';
import { Tree as ArboristTree } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';

import { useYorkieSeletedDataContext } from '../contexts/YorkieSeletedData';
import type { PresenceTreeNode, RootTreeNode } from '../contexts/YorkieSource';
import { sendToSDK } from '../../port';

import {
  ArrayIcon,
  CounterIcon,
  ObjectIcon,
  PrimitiveIcon,
  TextIcon,
  TreeIcon,
  UserIcon,
} from '../icons';

const RowHeight = 42;
const RowIndent = 22;

const TypeIcon = ({ type }) => {
  switch (type) {
    case 'YORKIE_OBJECT':
      return <ObjectIcon />;
    case 'YORKIE_ARRAY':
      return <ArrayIcon />;
    case 'YORKIE_PRIMITIVE':
      return <PrimitiveIcon />;
    case 'YORKIE_TEXT':
      return <TextIcon />;
    case 'YORKIE_TREE':
      return <TreeIcon />;
    case 'YORKIE_COUNTER':
      return <CounterIcon />;
    case 'USER':
      return <UserIcon />;
    default:
      return null;
  }
};

function RootNodeRenderer(props) {
  const type = props.node.data.type.split('YORKIE_')[1].toLowerCase();
  const { selectedNode, setSelectedNode } = useYorkieSeletedDataContext();

  useEffect(() => {
    if (selectedNode?.id === props.node.data.id) {
      setSelectedNode(props.node.data);
      sendToSDK({
        msg: 'devtools::node::detail',
        data: {
          path: props.node.data.path,
          type: props.node.data.type,
        },
      });
    }
  }, [props.node.data]);

  switch (props.node.data.type) {
    case 'YORKIE_OBJECT':
    case 'YORKIE_ARRAY':
      return (
        <div
          {...props}
          onClick={() => props.node.toggle()}
          className="tree-wrap"
        >
          <span
            className={classNames(
              'tree-item',
              props.node.data.isLastChild && 'last-child',
            )}
          >
            <span className="arrow-icon">{props.node.isOpen ? '▾' : '▸'}</span>
            <span className={classNames('icon', type)} title={type}>
              <TypeIcon type={props.node.data.type} />
            </span>
            {props.node.data.key}
            <span className="timeticket">{props.node.data.createdAt}</span>
          </span>
        </div>
      );
    default:
      return (
        <div
          {...props}
          onClick={() => setSelectedNode(props.node.data)}
          className="tree-wrap"
        >
          <span
            className={classNames(
              'tree-item',
              props.node.data.isLastChild && 'last-child',
              selectedNode?.id === props.node.data.id && 'is-selected',
            )}
          >
            <span className={classNames('icon', type)} title={type}>
              <TypeIcon type={props.node.data.type} />
            </span>
            <span>{props.node.data.key} :&nbsp;</span>
            <span className="tree-value">
              {JSON.stringify(props.node.data.value)}
            </span>
            <span className="timeticket">{props.node.data.createdAt}</span>
          </span>
        </div>
      );
  }
}

function PresenceNodeRenderer(props) {
  const { selectedPresence, setSelectedPresence } =
    useYorkieSeletedDataContext();

  useEffect(() => {
    if (selectedPresence?.id === props.node.data.id) {
      setSelectedPresence(props.node.data);
    }
  }, [props.node.data]);

  switch (props.node.data.type) {
    case 'USER':
      return (
        <div
          {...props}
          onClick={() => props.node.toggle()}
          className="tree-wrap"
        >
          <span className="tree-item">
            <span className="arrow-icon">{props.node.isOpen ? '▾' : '▸'}</span>
            <span className={classNames('icon', 'user')}>
              <TypeIcon type="USER" />
            </span>
            {props.node.data.clientID}
          </span>
        </div>
      );
    case 'JSON':
      return (
        <div
          {...props}
          onClick={() => setSelectedPresence(props.node.data)}
          className="tree-wrap"
        >
          <span
            className={classNames(
              'tree-item',
              props.node.data.isLastChild && 'last-child',
              selectedPresence?.id === props.node.data.id && 'is-selected',
            )}
          >
            {props.node.data.key} :&nbsp;
            <span className="tree-value">
              {JSON.stringify(props.node.data.value)}
            </span>
          </span>
        </div>
      );
    default:
      return null;
  }
}

/**
 * `rootChildAccessor` returns the children of the document node.
 */
function rootChildAccessor(node: RootTreeNode): Array<RootTreeNode> {
  if (!(node.type === 'YORKIE_OBJECT' || node.type === 'YORKIE_ARRAY')) {
    return null;
  }
  const children = Object.values(node.value);
  const length = children.length;
  const res = children.map((v, i) => {
    const path = `${node.path}.${v.key}`;
    if (v.type === 'YORKIE_OBJECT' || v.type === 'YORKIE_ARRAY') {
      return {
        ...v,
        id: path,
        path,
        isLastChild: i === length - 1,
      };
    } else {
      return {
        ...v,
        id: path,
        path,
        isLastChild: i === length - 1,
      };
    }
  });
  return res;
}

/**
 * `presenceChildAccessor` returns the children of the presence node.
 */
function presenceChildAccessor(
  node: PresenceTreeNode,
): Array<PresenceTreeNode> {
  if (node.type !== 'USER') return null;
  const length = Object.keys(node.presence).length;
  return Object.keys(node.presence)
    .sort()
    .map((key, i) => ({
      key,
      value: node.presence[key],
      id: `${node.clientID}-${key}`,
      type: 'JSON',
      isLastChild: i === length - 1,
    }));
}

/**
 * `PresenceTree` renders the presences of the document.
 */
export function PresenceTree({ data }) {
  const { ref, width, height } = useResizeObserver();
  return (
    <div ref={ref} className="arborist-tree-container">
      <ArboristTree
        data={data}
        className="arborist-tree"
        rowClassName="arborist-tree-row"
        indent={RowIndent}
        rowHeight={RowHeight}
        height={height}
        width={width}
        childrenAccessor={presenceChildAccessor}
      >
        {PresenceNodeRenderer}
      </ArboristTree>
    </div>
  );
}

/**
 * `RootTree` renders the root object of the document.
 */
export function RootTree({ data }) {
  const { ref, width, height } = useResizeObserver();
  return (
    <div ref={ref} className="arborist-tree-container">
      <ArboristTree
        data={data}
        className="arborist-tree"
        rowClassName="arborist-tree-row"
        indent={RowIndent}
        rowHeight={RowHeight}
        height={height}
        width={width}
        childrenAccessor={rootChildAccessor}
      >
        {RootNodeRenderer}
      </ArboristTree>
    </div>
  );
}
