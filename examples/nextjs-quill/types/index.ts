import { Indexable, Text as YorkieText } from '@yorkie-js/sdk';

export type YorkieDoc = {
  content: YorkieText;
};

export type TextValueType = {
  attributes?: Indexable;
  content?: string;
};
