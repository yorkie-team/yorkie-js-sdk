// Yorkie type for typescript
import type { TDAsset, TDBinding, TDShape, TDUser } from '@tldraw/tldraw';
import type { JSONObject } from 'yorkie-js-sdk';
export type Options = {
  apiKey?: string;
  syncLoopDuration: number;
  reconnectStreamDelay: number;
};

export type YorkieDocType = {
  shapes: JSONObject<Record<string, JSONObject<TDShape>>>;
  bindings: JSONObject<Record<string, JSONObject<TDBinding>>>;
  assets: JSONObject<Record<string, JSONObject<TDAsset>>>;
};

export type TlType = {
  shapes: Record<string, JSONObject<TDShape>>;
  bindings: Record<string, JSONObject<TDBinding>>;
  assets: Record<string, JSONObject<TDAsset>>;
};

export type HistoryType = {
  undoStack: Array<CommandType>;
  redoStack: Array<CommandType>;
};

export type CommandType = {
  snapshot: TlType;
  undo: () => void;
  redo: () => void;
};

export type YorkiePresenceType = {
  tdUser: TDUser;
};
