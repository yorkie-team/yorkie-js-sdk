import { Indexable, StreamConnectionStatus } from '@yorkie-js/sdk';
import { createStore } from './createStore';
import { DocumentContextType } from './DocumentProvider';

export const createDocumentStore = <R, P extends Indexable = Indexable>(
  initialRoot: R = {} as R,
  initialPresences: Array<{ clientID: string; presence: P }> = [],
) => {
  return createStore<DocumentContextType<R, P>>({
    doc: undefined,
    root: initialRoot,
    presences: initialPresences,
    connection: StreamConnectionStatus.Disconnected,
    update: () => {},
    loading: true,
    error: undefined,
  });
};
