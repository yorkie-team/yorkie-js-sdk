import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONElement } from '../json/element';
import { JSONRoot } from '../json/root';
import { JSONObject } from '../json/object';
import { Operation } from './operation';

export class SetOperation extends Operation {
  private key: string;
  private value: JSONElement;

  constructor(key: string, value: JSONElement, parentCreatedAt: TimeTicket, executedAt: TimeTicket) {
    super(parentCreatedAt, executedAt);
    this.key = key;
    this.value = value;
  }

  public static create(
    key: string,
    value: JSONElement,
    parentCreatedAt: TimeTicket,
    executedAt: TimeTicket,
  ): SetOperation {
    return new SetOperation(key, value, parentCreatedAt, executedAt);
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof JSONObject) {
      const obj = parentObject as JSONObject;
      const value = this.value.deepcopy();
      obj.set(this.key, value);
      root.registerElement(value);
    } else {
      logger.fatal(`fail to execute, only object can execute set`);
    }
  }

  public getAnnotatedString(): string {
    return `${this.getParentCreatedAt().getAnnotatedString()}.SET`
  }

  public getKey(): string {
    return this.key;
  }

  public getValue(): JSONElement {
    return this.value;
  }
}
