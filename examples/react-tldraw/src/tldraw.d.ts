import type { Indexable } from '@yorkie-js/sdk';

// A tldraw user is stored in Yorkie presence, which must be `Indexable`.
declare module '@tldraw/tldraw' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TDUser extends Indexable {}
}
