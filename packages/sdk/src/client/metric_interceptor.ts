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

import pkg from '../../package.json';
import { Interceptor } from '@connectrpc/connect';

/**
 * `createMetricInterceptor` creates an interceptor to add the x-yorkie-user-agent header for each
 * request.
 */
export function createMetricInterceptor(): Interceptor {
  return (next) => async (req) => {
    req.header.set('x-yorkie-user-agent', pkg.name + '/' + pkg.version);
    return await next(req);
  };
}
