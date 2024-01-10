import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';
import type { RootTreeNode } from '../components/Tree';

type SelectedNodeContext = [RootTreeNode, (node: RootTreeNode) => void];
const SelectedNodeContext = createContext<SelectedNodeContext | null>(null);

type Props = {
  children?: ReactNode;
};
export function SeleteNodeProvider({ children }: Props) {
  const selectedNodeState = useState(null);

  return (
    <SelectedNodeContext.Provider value={selectedNodeState}>
      {children}
    </SelectedNodeContext.Provider>
  );
}

export function useSeletedNode() {
  const value = useContext(SelectedNodeContext);
  if (value === undefined) {
    throw new Error('useSeletedNode should be used within SeleteNodeProvider');
  }
  return value;
}
