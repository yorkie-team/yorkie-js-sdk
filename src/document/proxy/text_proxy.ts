import { logger, LogLevel } from '../../util/logger';
import { ChangeContext } from '../change/context';
import { PlainText, TextNodeRange } from '../json/text';
import { EditOperation } from '../operation/edit_operation';

export class TextProxy {
  private context: ChangeContext;
  private handlers: any;

  constructor(context: ChangeContext) {
    this.context = context;
    this.handlers = {
      get: (target: PlainText, keyOrMethod: string): any => {
        if (logger.isEnabled(LogLevel.Debug)) {
          logger.debug(`obj[${keyOrMethod}]`);
        }

        if (keyOrMethod === 'edit') {
          return (fromIdx: number, toIdx: number, content: string): boolean => {
            this.edit(target, fromIdx, toIdx, content);
            return true;
          };
        } else if (keyOrMethod === 'getAnnotatedString') {
          return (): string => {
            return target.getAnnotatedString();
          };
        } else if (keyOrMethod === 'createRange') {
          return (fromIdx: number, toIdx: number): TextNodeRange => {
            return target.createRange(fromIdx, toIdx);
          };
        }

        logger.fatal(`unsupported method: ${keyOrMethod}`);
      }
    };
  }

  public static create(context: ChangeContext, target: PlainText): PlainText {
    const textProxy = new TextProxy(context);
    const { proxy, revoke } = Proxy.revocable(target, textProxy.getHandlers());
    // TODO call revoke after update
    return proxy;
  }

  public edit(target: PlainText, fromIdx: number, toIdx: number, content: string): void {
    if (fromIdx > toIdx) {
      logger.fatal('from should be less than or equal to to');
    }

    const range = target.createRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `EDIT: f:${fromIdx}->${range[0].getAnnotatedString()}, t:${toIdx}->${range[1].getAnnotatedString()} c:${content}`
      );
    }

    const ticket = this.context.issueTimeTicket();
    const [caretPos, maxCreatedAtMapByActor] = target.editInternal(range, content, null, ticket);

    this.context.push(new EditOperation(
      target.getCreatedAt(),
      range[0],
      range[1],
      maxCreatedAtMapByActor,
      content,
      ticket
    ));
  }
  
  public getHandlers(): any {
    return this.handlers;
  }
}
