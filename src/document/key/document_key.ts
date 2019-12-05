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

  public getCollection(): string {
    return this.collection;
  }

  public getDocument(): string {
    return this.document;
  }

  public toIDString(): string {
    return `${this.collection}$${this.document}`;
  }
}


