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

import { Interceptor } from '@connectrpc/connect';

/**
 * `createAuthInterceptor` creates an interceptor to add the Authorization header for each
 * request.
 */
export function createAuthInterceptor(
  apiKey?: string,
  token?: string,
): Interceptor {
  return (next) => async (req) => {
    if (apiKey) {
      req.header.set('x-api-key', apiKey);
    }
    if (token) {
      req.header.set('authorization', token);
    }
    return await next(req);
  };
}
