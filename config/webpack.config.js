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

const path = require('path');
const webpack = require('webpack');
const pkg = require('../package.json');
const CopyPlugin = require('copy-webpack-plugin');

const date = new Date().toISOString().replace(/:\d+\.\d+Z$/, 'Z');
const banner = `
yorkie-js-sdk for building collaborative editing applications.
 - Version: v${pkg.version}
 - Date: ${date}
 - Homepage: https://yorkie.dev

Copyright 2020 The Yorkie Authors. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
`;

module.exports = {
  entry: './src/yorkie',
  devtool: 'source-map',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, '../tsconfig.json'),
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias: {
      '@yorkie-js-sdk/src': path.resolve(__dirname, '../src/'),
      '@yorkie-js-sdk/test': path.resolve(__dirname, '../test/'),
    },
    extensions: ['.ts', '.js'],
  },
  output: {
    library: 'yorkie',
    libraryTarget: 'umd',
    filename: 'yorkie-js-sdk.js',
    globalObject: 'this',
    path: path.resolve(__dirname, '../dist'),
  },
  plugins: [
    new webpack.BannerPlugin({
      banner,
    }),
    // TODO(chacha912): When we exposed the converter, the resources_pb.d.ts
    // was not in the lib, so we got a compile error. For now, we bypass it by
    // directly copying the file. Let's delete this later when we know a more correct fix.
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(
            __dirname,
            '../src/api/yorkie/v1/resources_pb.d.ts',
          ),
          to: path.resolve(
            __dirname,
            '../lib/src/api/yorkie/v1/resources_pb.d.ts',
          ),
        },
      ],
    }),
  ],
};
