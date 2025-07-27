import { Indexable } from '@yorkie-js/sdk';
import { createStore } from './createStore';
import { DocumentContextType } from './DocumentProvider';

export const createDocumentStore = <R, P extends Indexable = Indexable>(
  initialState: DocumentContextType<R, P>,
) => {
  return createStore<DocumentContextType<R, P>>(initialState);
};
