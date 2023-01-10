// Yorkie type for typescript
import type { TDAsset, TDBinding, TDShape } from '@tldraw/tldraw';

export type Options = {
  apiKey?: string;
  presence: object;
  syncLoopDuration: number;
  reconnectStreamDelay: number;
};

export type YorkieDocType = {
  shapes: Record<string, TDShape>;
  bindings: Record<string, TDBinding>;
  assets: Record<string, TDAsset>;
};
