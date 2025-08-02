import { createDocumentSelector } from '@yorkie-js/react';

export const useDocumentSelector = createDocumentSelector<{
  counter: number;
}>();
