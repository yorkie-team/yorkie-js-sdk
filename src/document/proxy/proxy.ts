import { JSONElement } from '../json/element';
import { ChangeContext } from '../change/context';
import { ObjectProxy } from './object_proxy';
import { JSONObject } from '../json/object';

export function createProxy(context: ChangeContext, target: JSONObject): JSONObject {
  return ObjectProxy.create(context, target);
}
