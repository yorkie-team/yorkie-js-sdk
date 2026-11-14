import { createDocumentSelector, type Counter } from '@yorkie-js/react';

export type Presence = { username: string };

// Older versions of this example kept the count as a plain number, which
// loses clicks when two clients increase it at the same time. A Counter adds
// concurrent increases up instead.
export type Root = { counter: Counter | number };

export const useDocumentSelector = createDocumentSelector<Root, Presence>();
