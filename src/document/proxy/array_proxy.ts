import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { SetOperation } from '../operation/set_operation';
import { AddOperation } from '../operation/add_operation';
import { ChangeContext } from '../change/context';
import { JSONElement } from '../json/element';
import { JSONObject } from '../json/object';
import { JSONArray } from '../json/array';
import { JSONPrimitive } from '../json/primitive';
import { ObjectProxy } from './object_proxy';

export class ArrayProxy {
  private context: ChangeContext;
  private handlers: any;
  private array: JSONArray;

  constructor(context: ChangeContext, array: JSONArray) {
    this.context = context;
    this.array = array;
    this.handlers = {
      get: (target, method: string) => {
        if (method === 'push') {
          return (value) => {
            ArrayProxy.pushInternal(this.context, target, value);
          };
        }
      }
    }
  }

  public static create(context: ChangeContext, target: JSONArray): JSONArray {
    const arrayProxy = new ArrayProxy(context, target);
    const { proxy, revoke } = Proxy.revocable(target, arrayProxy.getHandlers());
    return proxy;
  }

  public static pushInternal(context: ChangeContext, target: JSONArray, value: any): void {
    const ticket = context.issueTimeTicket();

    if (JSONPrimitive.isSupport(value)) {
      const primitive = JSONPrimitive.create(value, ticket);
      target.append(primitive);
      context.push(AddOperation.create(target.getCreatedAt(), target.getLastCreatedAt(), primitive, ticket));
    } else if (Array.isArray(value)) {
      const array = JSONArray.create(ticket);
      target.append(array);
      context.push(AddOperation.create(target.getCreatedAt(), target.getLastCreatedAt(), array, ticket));
      for (const element of value) {
        ArrayProxy.pushInternal(context, array, element)
      }
    } else if (typeof value === 'object') {
      const obj = JSONObject.create(ticket);
      target.append(obj);
      context.push(AddOperation.create(target.getCreatedAt(), target.getLastCreatedAt(), obj, ticket));

      for (const [k, v] of Object.entries(value)) {
        ObjectProxy.setInternal(context, obj, k, v);
      }
    } else {
      throw new TypeError(`Unsupported type of value: ${typeof value}`)
    }
  }

  public getHandlers(): any {
    return this.handlers;
  }
}
