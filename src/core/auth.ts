/*
 * Copyright 2021 The Yorkie Authors. All rights reserved.
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

/**
 * `AuthUnaryInterceptor` is a unary interceptor to add the Authorization header for each
 * request.
 */
export class AuthUnaryInterceptor {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * `intercept` intercepts the request and adds the token to the metadata.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public intercept(request: any, invoker: any): any {
    const metadata = request.getMetadata();
    metadata.Authorization = this.token;
    return invoker(request);
  }
}

/**
 * `AuthStreamInterceptor` is a stream interceptor to add the Authorization header for each
 * request.
 */
export class AuthStreamInterceptor {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * `intercept` intercepts the request and adds the token to the metadata.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public intercept(request: any, invoker: any): any {
    const metadata = request.getMetadata();
    metadata.Authorization = this.token;
    return invoker(request);
  }
}
