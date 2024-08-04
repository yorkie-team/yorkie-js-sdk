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
import { useMemo } from 'react';
import { Tree as ArboristTree } from 'react-arborist';
import type { NodeRendererProps } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';

import { useSelectedNode } from '../contexts/SelectedNode';
import { useSelectedPresence } from '../contexts/SelectedPresence';
import type { Devtools } from 'yorkie-js-sdk';

import {
  ArrayIcon,
  CounterIcon,
  ObjectIcon,
  PrimitiveIcon,
  TextIcon,
  TreeIcon,
  UserIcon,
} from '../icons';

export type RootTreeNode = Devtools.JSONElement & {
  id: string;
  path: string;
  isLastChild?: boolean;
};

export type UserNode = Devtools.Client & {
  id: string;
  type: 'USER';
};
export type PresenceJsonNode = {
  id: string;
  key: string;
  value: Devtools.Json;
  isLastChild: boolean;
  type: 'JSON';
};
export type PresenceTreeNode = UserNode | PresenceJsonNode;

const RootPath = '$';
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

/**
 * `RootNodeRenderer` handles the rendering of root nodes
 */
function RootNodeRenderer(props: NodeRendererProps<RootTreeNode>) {
  const type = props.node.data.type.split('YORKIE_')[1].toLowerCase();
  const [selectedNode, setSelectedNode] = useSelectedNode();

  switch (props.node.data.type) {
    case 'YORKIE_OBJECT':
    case 'YORKIE_ARRAY':
      return (
        <div
          style={props.style}
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
          style={props.style}
          onClick={() => {
            if (props.node.data?.id === selectedNode?.id) {
              return;
            }
            setSelectedNode(props.node.data);
          }}
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

/**
 * `PresenceNodeRenderer` handles the rendering of presence nodes
 */
function PresenceNodeRenderer(props: NodeRendererProps<PresenceTreeNode>) {
  const [selectedPresence, setSelectedPresence] = useSelectedPresence();

  switch (props.node.data.type) {
    case 'USER':
      return (
        <div
          style={props.style}
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
          style={props.style}
          onClick={() => {
            if (props.node.data?.id === selectedPresence?.id) {
              return;
            }
            setSelectedPresence(props.node.data as PresenceJsonNode);
          }}
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
  const children = Object.values(node.value) as Array<Devtools.JSONElement>;
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
): Array<PresenceJsonNode> {
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
export function PresenceTree({
  presences,
}: {
  presences: Array<Devtools.Client>;
}) {
  const { ref, width, height } = useResizeObserver();
  const data = useMemo(() => {
    const presenceNodes: Array<PresenceTreeNode> = presences.map((client) => ({
      ...client,
      id: client.clientID,
      type: 'USER',
    }));
    return presenceNodes;
  }, [presences]);

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
export function RootTree({ root }: { root: Devtools.JSONElement }) {
  const { ref, width, height } = useResizeObserver();
  const data = useMemo(() => {
    const rootNode: Array<RootTreeNode> = root
      ? [{ ...root, id: RootPath, path: RootPath }]
      : [];
    return rootNode;
  }, [root]);

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
