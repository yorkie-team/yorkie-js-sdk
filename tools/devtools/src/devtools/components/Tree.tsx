import classNames from 'classnames';
import { useEffect } from 'react';
import { Tree as ArboristTree } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';

import { useYorkieSeletedDataContext } from '../contexts/YorkieSeletedData';
import { sendMessageToTab } from '../../port';

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

function RootNodeRenderer(props) {
  const type = props.node.data.type.split('YORKIE_')[1].toLowerCase();
  const { selectedNode, setSelectedNode } = useYorkieSeletedDataContext();

  useEffect(() => {
    if (selectedNode?.id === props.node.data.id) {
      setSelectedNode(props.node.data);
      sendMessageToTab({
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

function presenceChildAccessor(node) {
  if (!node.presence) return null;
  const length = Object.keys(node.presence).length;
  return Object.entries(node.presence).map(([key, value], i) => ({
    key,
    value,
    id: `${node.clientID}-${key}`,
    type: 'JSON',
    isLastChild: i === length - 1,
  }));
}

function rootChildAccessor(node) {
  if (!(node.type === 'YORKIE_OBJECT' || node.type === 'YORKIE_ARRAY')) {
    return null;
  }
  const length = Object.keys(node.value).length;
  const res = Object.entries(node.value).map(([_, v]: any, i) => {
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
