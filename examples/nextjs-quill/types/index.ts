import { Indexable, Text as YorkieText } from '@yorkie-js/sdk';

// Type definition for the Yorkie document structure
// Contains a single 'content' field which is a Yorkie Text object for collaborative editing
export type YorkieDoc = {
  content: YorkieText;
};

// Type definition for individual text values within Yorkie Text
// Represents a single text node with optional formatting attributes and content
export type TextValueType = {
  // Optional formatting attributes (bold, italic, color, etc.)
  attributes?: Indexable;
  // Optional text content string
  content?: string;
};
