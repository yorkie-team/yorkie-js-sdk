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

import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { createContext, useContext, useState } from 'react';
import type { RootTreeNode } from '../components/Tree';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

type SelectedNodeContext = [
  RootTreeNode,
  Dispatch<SetStateAction<RootTreeNode>>,
];
const SelectedNodeContext = createContext<SelectedNodeContext | null>(null);

type Props = {
  children?: ReactNode;
};
export function SelectedNodeProvider({ children }: Props) {
  const selectedNodeState = useState(null);

  return (
    <SelectedNodeContext.Provider value={selectedNodeState}>
      {children}
    </SelectedNodeContext.Provider>
  );
}

export function useSelectedNode() {
  const value = useContext(SelectedNodeContext);
  if (value === undefined) {
    throw new YorkieError(
      Code.ErrContextNotProvided,
      'useSelectedNode should be used within SelectedNodeProvider',
    );
  }
  return value;
}
