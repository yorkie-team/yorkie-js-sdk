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
