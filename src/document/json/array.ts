import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { JSONContainer, JSONElement } from './element';
import { RGA } from './rga';

/**
 * JSONArray represents JSON array data structure including logical clock.
 */
export class JSONArray extends JSONContainer {
  private elements: RGA;

  constructor(createdAt: TimeTicket, elements: RGA) {
    super(createdAt);
    this.elements = elements;
  }

  public static create(createdAt: TimeTicket): JSONArray {
    return new JSONArray(createdAt, RGA.create());
  }

  public insertAfter(prevCreatedAt: TimeTicket, value: JSONElement): void {
    this.elements.insertAfter(prevCreatedAt, value);
  }

  public remove(createdAt: TimeTicket): JSONElement {
    return this.elements.remove(createdAt);
  }

  public removeByIndex(index: number): JSONElement {
    return this.elements.removeByIndex(index);
  }

  public getLastCreatedAt(): TimeTicket {
    return this.elements.getLastCreatedAt();
  }

  public *[Symbol.iterator](): IterableIterator<JSONElement> {
    for (const node of this.elements) {
      if (!node.isRemoved()) {
        yield node.getValue();
      }
    }
  }

  public *getDescendants(): IterableIterator<JSONElement> {
    for (const node of this.elements) {
      const element = node.getValue();
      if (element instanceof JSONContainer) {
        for (const descendant of element.getDescendants()) {
          yield descendant;
        }
      } 

      yield element;
    }
  }

  public toJSON(): string {
    const json = []
    for (const value of this) {
      json.push(value.toJSON());
    }
    return `[${json.join(',')}]`;
  }

  public deepcopy(): JSONArray {
    const clone = JSONArray.create(this.getCreatedAt());
    for (const node of this.elements) {
      clone.elements.insertAfter(
        clone.getLastCreatedAt(),
        node.getValue().deepcopy()
      );
    }
    clone.delete(this.getDeletedAt())
    return clone;
  }
}
