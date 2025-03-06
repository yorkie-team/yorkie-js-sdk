import { Indexable, Json } from '@yorkie-js/sdk/src/document/document';
import { TDUser } from '@tldraw/tldraw';

declare module '@tldraw/tldraw' {
  interface TDUser extends Indexable {}
}
