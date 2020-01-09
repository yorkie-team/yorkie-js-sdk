const path = require('path');

module.exports = {
  watch: true,
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
