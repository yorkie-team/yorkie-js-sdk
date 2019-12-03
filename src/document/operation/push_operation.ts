import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONElement } from '../json/element';
import { JSONRoot } from '../json/root';
import { JSONArray } from '../json/array';
import { Operation } from './operation';

export class PushOperation extends Operation {
  private value: JSONElement;

  constructor(value: JSONElement, parentCreatedAt: TimeTicket, executedAt: TimeTicket) {
    super(parentCreatedAt, executedAt);
    this.value = value;
  }

  public static create(
    value: JSONElement,
    parentCreatedAt: TimeTicket,
    executedAt: TimeTicket,
  ): PushOperation {
    return new PushOperation(value, parentCreatedAt, executedAt);
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt()) as JSONArray;
    parentObject.append(this.value);
    root.registerElement(this.value);
  }
}
