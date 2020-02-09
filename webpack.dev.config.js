const path = require('path');
const webpack = require('webpack');
const pkg = require('./package.json');

const date = (new Date()).toISOString().replace(/:\d+\.\d+Z$/, 'Z');
const banner = `
yorkie-js-sdk for building collaborative editing applications.
 - Version: v${pkg.version}
 - Date: ${date}
 - Homepage: https://yorkie.dev

Copyright 2020- hackerwins. and other contributors
`;

module.exports = {
  entry: './src/yorkie',
  devtool: 'inline-source-map',
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    library: 'yorkie',
    libraryTarget: 'umd',
    libraryExport: 'default',
    filename: 'yorkie.js',
    path: path.resolve(__dirname, './dist'),
  },
  plugins: [
    new webpack.BannerPlugin({
      banner,
    })
  ],
  devServer: {
    contentBase: path.join(__dirname, './dist'),
    compress: true,
    hot: true,
    host: '0.0.0.0',
    port: 9000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        pathRewrite: {'^/api' : ''}
      }
    }
  },
};
