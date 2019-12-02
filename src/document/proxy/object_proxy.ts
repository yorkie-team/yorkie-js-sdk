import { Object } from '../json/object';

export class ObjectProxy extends Object {
  public set(key: string, value: string): void {
    super.set(key, value);
  }
}
