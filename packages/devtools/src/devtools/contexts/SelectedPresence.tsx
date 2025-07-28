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
import type { PresenceJsonNode } from '../components/Tree';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

type SelectedPresenceContext = [
  PresenceJsonNode,
  Dispatch<SetStateAction<PresenceJsonNode>>,
];
// eslint-disable-next-line @typescript-eslint/ban-types
const SelectedPresenceContext = createContext<SelectedPresenceContext | null>(
  null,
);

type Props = {
  children?: ReactNode;
};

/**
 * Provides selected presence context to descendant components.
 *
 * @param props.children - React elements that consume the selected presence context.
 * @returns A context provider wrapping the given children.
 */
export function SelectedPresenceProvider({ children }: Props) {
  const selectedPresenceState = useState(null);

  return (
    <SelectedPresenceContext.Provider value={selectedPresenceState}>
      {children}
    </SelectedPresenceContext.Provider>
  );
}

/**
 * Hook to access and update the currently selected presence node.
 *
 * @throws YorkieError if called outside of a SelectedPresenceProvider.
 * @returns A tuple [selectedPresence, setSelectedPresence].
 */
export function useSelectedPresence() {
  const value = useContext(SelectedPresenceContext);
  if (value === undefined) {
    throw new YorkieError(
      Code.ErrContextNotProvided,
      'useSelectedPresence should be used within SelectedPresenceProvider',
    );
  }
  return value;
}
