import { logger, LogLevel } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { SetOperation } from '../operation/set_operation';
import { RemoveOperation } from '../operation/remove_operation';
import { ChangeContext } from '../change/context';
import { JSONElement } from '../json/element';
import { JSONObject } from '../json/object';
import { JSONArray } from '../json/array';
import { JSONPrimitive } from '../json/primitive';
import { ArrayProxy } from './array_proxy';

export class ObjectProxy {
  private context: ChangeContext;
  private handlers: any;

  constructor(context: ChangeContext) {
    this.context = context;
    this.handlers = {
      set: (target: JSONObject, key: string, value: any): boolean => {
        if (logger.isEnabled(LogLevel.Debug)) {
          logger.debug(`obj[${key}]=${JSON.stringify(value)}`);
        }

        ObjectProxy.setInternal(this.context, target, key, value);
        return true;
      },

      get: (target: JSONObject, key: string): any => {
        if (logger.isEnabled(LogLevel.Debug)) {
          logger.debug(`obj[${key}]`);
        }

        const elem = target.get(key);
        if (elem == null) {
          return null;
        } else if (elem instanceof JSONPrimitive) {
          const primitive = elem as JSONPrimitive;
          return primitive.getValue();
        } else if (elem instanceof JSONObject) {
          const obj = elem as JSONObject;
          return ObjectProxy.create(this.context, obj);
        } else if (elem instanceof JSONArray) {
          const array = elem as JSONArray;
          return ArrayProxy.create(this.context, array);
        }

        throw new TypeError(`Unsupported type of element: ${typeof elem}`)
      },

      deleteProperty: (target: JSONObject, key: string): boolean => {
        if (logger.isEnabled(LogLevel.Debug)) {
          logger.debug(`obj[${key}]`);
        }

        ObjectProxy.removeInternal(this.context, target, key);
        return true;
      }
    }
  }

  public static create(context: ChangeContext, target: JSONObject): JSONObject {
    const objectProxy = new ObjectProxy(context);
    const { proxy, revoke } = Proxy.revocable(target, objectProxy.getHandlers());
    // TODO call revoke after update
    return proxy;
  }

  public static setInternal(context: ChangeContext, target: JSONObject, key: string, value: any): void {
    const ticket = context.issueTimeTicket();

    if (JSONPrimitive.isSupport(value)) {
      const primitive = JSONPrimitive.of(value, ticket);
      target.set(key, primitive);
      context.push(SetOperation.create(key, primitive, target.getCreatedAt(), ticket));
    } else if (Array.isArray(value)) {
      const array = JSONArray.create(ticket);
      target.set(key, array);
      context.push(SetOperation.create(key, JSONArray.create(ticket), target.getCreatedAt(), ticket));
      for (const element of value) {
        ArrayProxy.pushInternal(context, array, element)
      }
    } else if (typeof value === 'object') {
      const obj = JSONObject.create(ticket);
      target.set(key, obj);
      context.push(SetOperation.create(key, JSONObject.create(ticket), target.getCreatedAt(), ticket));
      for (const [k, v] of Object.entries(value)) {
        ObjectProxy.setInternal(context, obj, k, v);
      }
    } else {
      logger.fatal(`unsupported type of value: ${typeof value}`);
    }
  }

  public static removeInternal(context: ChangeContext, target: JSONObject, key: string): void {
    const ticket = context.issueTimeTicket();
    const removed = target.removeByKey(key);
    context.push(RemoveOperation.create(target.getCreatedAt(), removed.getCreatedAt(), ticket));
  }

  public getHandlers(): any {
    return this.handlers;
  }
}
