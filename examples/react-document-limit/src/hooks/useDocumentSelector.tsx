import { createDocumentSelector } from '@yorkie-js/react';

export type Presence = { username: string };

export const useDocumentSelector = createDocumentSelector<
  { counter: number },
  Presence
>();
