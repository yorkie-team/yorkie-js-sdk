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

import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';
import type { PresenceTreeNode } from '../components/Tree';

type SelectedPresenceContext = [
  PresenceTreeNode,
  (node: PresenceTreeNode) => void,
];
const SelectedPresenceContext = createContext<SelectedPresenceContext | null>(
  null,
);

type Props = {
  children?: ReactNode;
};
export function SeletedPresenceProvider({ children }: Props) {
  const selectedPresenceState = useState(null);

  return (
    <SelectedPresenceContext.Provider value={selectedPresenceState}>
      {children}
    </SelectedPresenceContext.Provider>
  );
}

export function useSeletedPresence() {
  const value = useContext(SelectedPresenceContext);
  if (value === undefined) {
    throw new Error(
      'useSeletedPresence should be used within SeletedPresenceProvider',
    );
  }
  return value;
}
