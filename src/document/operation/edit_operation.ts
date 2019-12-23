import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONRoot } from '../json/root';
import { PlainText } from '../json/text';
import { TextNodePos } from '../json/text';
import { Operation } from './operation';

export class EditOperation extends Operation {
  private fromPos: TextNodePos;
  private toPos: TextNodePos;
  private maxCreatedAtMapByActor;
  private content: string;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: TextNodePos,
    toPos: TextNodePos,
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    content: string,
    executedAt: TimeTicket
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.maxCreatedAtMapByActor = maxCreatedAtMapByActor;
    this.content = content;
  }

  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: TextNodePos,
    toPos: TextNodePos,
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    content: string,
    executedAt: TimeTicket
  ): EditOperation {
    return new EditOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      maxCreatedAtMapByActor,
      content,
      executedAt
    );
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof PlainText) {
      const text = parentObject as PlainText;
      text.editInternal([this.fromPos, this.toPos], this.content, this.maxCreatedAtMapByActor, this.getExecutedAt());
    } else {
      logger.fatal(`fail to execute, only PlainText can execute edit`);
    }
  }

  public getFromPos(): TextNodePos {
    return this.fromPos;
  }

  public getToPos(): TextNodePos {
    return this.toPos;
  }

  public getContent(): string {
    return this.content;
  }

  public getMaxCreatedAtMapByActor(): Map<string, TimeTicket> {
    return this.maxCreatedAtMapByActor;
  }
}
