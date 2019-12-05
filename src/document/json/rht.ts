import { JSONElement } from './element';

export class RHT {
  private elementMapByKey: Map<string, JSONElement>
  private elementMapByCreatedAt: Map<string, JSONElement>;

  constructor() {
    this.elementMapByKey = new Map();
    this.elementMapByCreatedAt = new Map();
  }

  public static create(): RHT {
    return new RHT()
  }

  public set(key: string, value: JSONElement): void {
    const prev = this.elementMapByKey.get(key);
    if (!prev || value.getCreatedAt().after(prev.getCreatedAt())) {
      this.elementMapByKey.set(key, value)
    }
  }

  public get(key: string): JSONElement {
    return this.elementMapByKey.get(key);
  }

  public getMembers(): Map<string, JSONElement> {
    return this.elementMapByKey;
  }
}
