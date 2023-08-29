// Yorkie type for typescript
import type { TDAsset, TDBinding, TDShape, TDUser } from '@tldraw/tldraw';
import type { JSONObject } from 'yorkie-js-sdk';
export type Options = {
  apiKey?: string;
  syncLoopDuration: number;
  reconnectStreamDelay: number;
};

export type YorkieDocType = {
  shapes: JSONObject<Record<string, TDShape>>;
  bindings: JSONObject<Record<string, TDBinding>>;
  assets: JSONObject<Record<string, TDAsset>>;
};

export type YorkiePresenceType = {
  tdUser: TDUser;
};
