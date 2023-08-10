import { type Text } from 'yorkie-js-sdk';

export type YorkieDoc = {
  content: Text;
};

export type YorkiePresence = {
  username: string;
  // TODO(chacha912): we need to export `TextRangeStruct` type from yorkie-js-sdk
  selection: any;
};
