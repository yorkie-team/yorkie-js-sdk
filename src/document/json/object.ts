import { logger } from '../../util/logger';
import { JSONElement } from './element';

export class Object extends JSONElement {
  public set(key: string, value: string): void {
    logger.warn('Unimplemented');
  }

  public toJSON(): string {
    logger.warn('Unimplemented');
    return '';
  }
}
