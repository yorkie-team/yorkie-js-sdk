import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

type SelectedDataContext = {
  selectedNode: any;
  setSelectedNode: (node: any) => void;
  selectedPresence: any;
  setSelectedPresence: (presence: any) => void;
};
const YorkieSeletedDataContext = createContext<SelectedDataContext | null>(
  null,
);

type Props = {
  children?: ReactNode;
};
export function YorkieSeletedDataProvider({ children }: Props) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedPresence, setSelectedPresence] = useState(null);

  const value = useMemo(
    () => ({
      selectedNode,
      setSelectedNode,
      selectedPresence,
      setSelectedPresence,
    }),
    [selectedNode, setSelectedNode, selectedPresence, setSelectedPresence],
  );

  return (
    <YorkieSeletedDataContext.Provider value={value}>
      {children}
    </YorkieSeletedDataContext.Provider>
  );
}

export function useYorkieSeletedDataContext() {
  const context = useContext(YorkieSeletedDataContext);
  if (context === null) {
    throw new Error(
      'Please use a <YorkieSeletedDataProvider> up the component tree to use useYorkieSeletedDataContext()',
    );
  }
  return context;
}
