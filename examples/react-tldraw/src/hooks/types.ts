// Yorkie type for typescript
import type { TDAsset, TDBinding, TDShape, TDUser } from '@tldraw/tldraw';
import type { JSONObject } from '@yorkie-js/sdk';

export type YorkieDocType = {
  shapes: JSONObject<Record<string, JSONObject<TDShape>>>;
  bindings: JSONObject<Record<string, JSONObject<TDBinding>>>;
  assets: JSONObject<Record<string, JSONObject<TDAsset>>>;
};

export type YorkiePresenceType = {
  tdUser: TDUser;
};
