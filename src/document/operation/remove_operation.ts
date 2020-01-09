import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONRoot } from '../json/root';
import { JSONObject } from '../json/object';
import { JSONArray } from '../json/array';
import { Operation } from './operation';

export class RemoveOperation extends Operation {
  private createdAt: TimeTicket;

  constructor(parentCreatedAt: TimeTicket, createdAt: TimeTicket, executedAt: TimeTicket) {
    super(parentCreatedAt, executedAt);
    this.createdAt = createdAt;
  }

  public static create(
    parentCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt: TimeTicket
  ): RemoveOperation {
    return new RemoveOperation(parentCreatedAt, createdAt, executedAt);
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof JSONObject) {
      const obj = parentObject as JSONObject;
      obj.remove(this.createdAt, this.getExecutedAt());
    } else if (parentObject instanceof JSONArray) {
      const array = parentObject as JSONArray;
      array.remove(this.createdAt);
    } else {
      logger.fatal(`only object and array can execute remove: ${parentObject}`);
    }
  }

  public getAnnotatedString(): string {
    return `${this.getParentCreatedAt().getAnnotatedString()}.REMOVE`
  }

  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }
}
