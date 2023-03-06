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
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const WebpackBundleAnalyzer = require('webpack-bundle-analyzer');

module.exports = (env, arg) => {
  const config = {
    entry: './src/yorkie',
    devtool: 'inline-source-map',
    mode: 'development',
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
        {
          test: /\.ts$/,
          exclude: [path.resolve(__dirname, 'test')],
          enforce: 'post',
          use: {
            loader: 'istanbul-instrumenter-loader',
            options: { esModules: true },
          },
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
      libraryExport: 'default',
      filename: 'yorkie.js',
      path: path.resolve(__dirname, '../public/dist'),
    },
    devServer: {
      static: path.join(__dirname, '../public'),
      compress: true,
      hot: true,
      host: '0.0.0.0',
      port: 9000,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          pathRewrite: { '^/api': '' },
        },
      },
    },
    plugins: [new NodePolyfillPlugin()],
  };

  if (arg.profile) {
    config.plugins.push(new WebpackBundleAnalyzer.BundleAnalyzerPlugin());
  }

  return config;
};
