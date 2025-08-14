import { TextPosStructRange, type Text } from '@yorkie-js/sdk';

export type YorkieDoc = {
  content: Text;
};

export type YorkiePresence = {
  username: string;
  selection?: TextPosStructRange;
};
