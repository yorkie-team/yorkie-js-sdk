/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { logger } from './logger';

export type NextFn<T> = (value: T) => void;
export type ErrorFn = (error: Error) => void;
export type CompleteFn = () => void;

export interface Observer<T> {
  next?: NextFn<T>;
  error?: ErrorFn;
  complete?: CompleteFn;
}

export type Unsubscribe = () => void;

export interface SubscribeFn<T> {
  (next?: NextFn<T>, error?: ErrorFn, complete?: CompleteFn): Unsubscribe;
  (observer: Observer<T>): Unsubscribe;
}

const Noop = (): void => {
  // Do nothing
};

class ObserverProxy<T> implements Observer<T> {
  public finalized = false;
  public onNoObservers: Executor<T> | undefined;

  private observers: Array<Observer<T>> | undefined = [];
  private unsubscribes: Unsubscribe[] = [];
  private observerCount = 0;
  private task = Promise.resolve();
  private finalError: Error;

  constructor(executor: Executor<T>, onNoObservers?: Executor<T>) {
    this.onNoObservers = onNoObservers;
    this.task.then(() => {
      executor(this);
    }).catch((error) => {
      this.error(error);
    });
  }

  public next(value: T): void {
    this.forEachObserver((observer: Observer<T>) => {
      observer.next(value);
    });
  }

  public error(error: Error): void {
    this.forEachObserver((observer: Observer<T>) => {
      observer.error(error);
    });
    this.close(error);
  }

  public complete(): void {
    this.forEachObserver((observer: Observer<T>) => {
      observer.complete();
    });
    this.close();
  }

  public subscribe(
    nextOrObserver: Observer<T> | NextFn<T>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe {
    let observer: Observer<T>;

    if (!nextOrObserver) {
      logger.fatal('missing observer');
    }

    if (this.finalized) {
      logger.fatal('observable is finalized due to previous error');
    }

    if (typeof nextOrObserver === 'object') {
      observer = nextOrObserver as Observer<T>;
    } else {
      observer = {
        next: nextOrObserver as NextFn<T>,
        error,
        complete,
      } as Observer<T>;
    }

    if (observer.next === undefined) {
      observer.next = Noop as NextFn<T>;
    }
    if (observer.error === undefined) {
      observer.error = Noop as ErrorFn;
    }
    if (observer.complete === undefined) {
      observer.complete = Noop as CompleteFn;
    }

    const unsub = this.unsubscribeOne.bind(this, this.observers!.length);

    if (this.finalized) {
      this.task.then(() => {
        try {
          if (this.finalError) {
            observer.error(this.finalError);
          } else {
            observer.complete();
          }
        } catch (err) {
          // nothing
          logger.warn(err);
        }
        return;
      });
    }

    this.observers!.push(observer as Observer<T>);
    this.observerCount += 1;

    return unsub;
  }

  private unsubscribeOne(i: number): void {
    if (this.observers === undefined || this.observers[i] === undefined) {
      return;
    }

    delete this.observers[i];

    this.observerCount -= 1;
    if (this.observerCount === 0 && this.onNoObservers !== undefined) {
      this.onNoObservers(this);
    }
  }

  private forEachObserver(fn: (observer: Observer<T>) => void): void {
    if (this.finalized) {
      return;
    }

    for (let i = 0; i < this.observers!.length; i++) {
      this.sendOne(i, fn);
    }
  }

  private sendOne(i: number, fn: (observer: Observer<T>) => void): void {
    this.task.then(() => {
      if (this.observers !== undefined && this.observers[i] !== undefined) {
        try {
          fn(this.observers[i]);
        } catch (err) {
          logger.error(err);
        }
      }
    });
  }

  private close(err?: Error): void {
    if (this.finalized) {
      return;
    }

    this.finalized = true;
    if (err !== undefined) {
      this.finalError = err;
    }

    this.task.then(() => {
      this.observers = undefined;
      this.onNoObservers = undefined;
    });
  }
}

export interface Observable<T> {
  subscribe: SubscribeFn<T>;
  getProxy?: () => ObserverProxy<T>;
}

export type Executor<T> = (observer: Observer<T>) => void;

export function createObservable<T>(executor: Executor<T>): Observable<T> {
  const proxy = new ObserverProxy(executor);
  return {
    subscribe: proxy.subscribe.bind(proxy),
    getProxy: (): ObserverProxy<T> => {
      return proxy;
    },
  };
}
