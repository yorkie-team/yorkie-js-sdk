import { logger } from '../util/logger';
import { Root } from './json/root';
import { ObjectProxy } from './proxy/object_proxy';

export class DocumentKey {
  private collection: string;
  private document: string;

  constructor(collection: string, document: string) {
    this.collection = collection;
    this.document = document;
  }

  public static of(collection: string, document: string): DocumentKey {
    return new DocumentKey(collection, document);
  }
}

export class Document {
  private key: DocumentKey;
  private root: Root;

  constructor(collection: string, document: string) {
    this.key = DocumentKey.of(collection, document);
    this.root = Root.create();
  }

  public static of(collection: string, document: string): Document {
    return new Document(collection, document);
  }

  public update(updater: (root: ObjectProxy) => void, comment?: string): void {
    logger.warn('Unimplemented');
  }

  public toJSON(): string {
    logger.warn('Unimplemented');
    return '';
  }
}
