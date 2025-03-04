import { type Text, TextPosStructRange } from '@yorkie-js/sdk';

export type YorkieDoc = {
  content: Text;
};

export type YorkiePresence = {
  username: string;
  color: string;
  selection?: TextPosStructRange;
};
