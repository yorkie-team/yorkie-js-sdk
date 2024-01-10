import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

type SelectedPresenceContext = any;
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
  if (value === null) {
    throw new Error(
      'useSeletedPresence should be used within SeletedPresenceProvider',
    );
  }
  return value;
}
