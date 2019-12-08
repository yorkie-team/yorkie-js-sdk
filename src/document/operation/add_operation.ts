import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONElement } from '../json/element';
import { JSONRoot } from '../json/root';
import { JSONArray } from '../json/array';
import { Operation } from './operation';

export class AddOperation extends Operation {
  private prevCreatedAt: TimeTicket;
  private value: JSONElement;

  constructor(parentCreatedAt: TimeTicket, prevCreatedAt: TimeTicket, value: JSONElement, executedAt: TimeTicket) {
    super(parentCreatedAt, executedAt);
    this.prevCreatedAt = prevCreatedAt;
    this.value = value;
  }

  public static create(
    parentCreatedAt: TimeTicket,
    prevCreatedAt: TimeTicket,
    value: JSONElement,
    executedAt: TimeTicket,
  ): AddOperation {
    return new AddOperation(parentCreatedAt, prevCreatedAt, value, executedAt);
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof JSONArray) {
      const array = parentObject as JSONArray;
      array.insertAfter(this.prevCreatedAt, this.value);
      root.registerElement(this.value);
    } else {
      logger.fatal(``);
    }
  }

  public getPrevCreatedAt(): TimeTicket {
    return this.prevCreatedAt;
  }

  public getValue(): JSONElement {
    return this.value;
  }

}
