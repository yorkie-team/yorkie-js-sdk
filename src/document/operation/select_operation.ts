import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONRoot } from '../json/root';
import { PlainText } from '../json/text';
import { TextNodePos } from '../json/text';
import { Operation } from './operation';

export class SelectOperation extends Operation {
  private fromPos: TextNodePos;
  private toPos: TextNodePos;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: TextNodePos,
    toPos: TextNodePos,
    executedAt: TimeTicket
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
  }

  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: TextNodePos,
    toPos: TextNodePos,
    executedAt: TimeTicket
  ): SelectOperation {
    return new SelectOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      executedAt
    );
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof PlainText) {
      const text = parentObject as PlainText;
      text.updateSelection([this.fromPos, this.toPos], this.getExecutedAt());
    } else {
      logger.fatal(`fail to execute, only PlainText can execute select`);
    }
  }

  public getAnnotatedString(): string {
    const parent = this.getParentCreatedAt().getAnnotatedString();
    const fromPos = this.fromPos.getAnnotatedString();
    const toPos = this.toPos.getAnnotatedString();
    return `${parent}.SELT(${fromPos},${toPos})`
  }

  public getFromPos(): TextNodePos {
    return this.fromPos;
  }

  public getToPos(): TextNodePos {
    return this.toPos;
  }
}
