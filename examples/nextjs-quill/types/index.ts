import { TextPosStructRange, Text as YorkieText } from '@yorkie-js/sdk';

export type YorkieDoc = {
  content: YorkieText;
};

export type YorkiePresence = {
  username: string;
  color: string;
  selection?: TextPosStructRange;
};
