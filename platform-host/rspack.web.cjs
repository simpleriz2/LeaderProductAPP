const path = require('node:path');
const { HtmlRspackPlugin } = require('@rspack/core');
module.exports = {
  mode: 'production', target: 'web', entry: './index.web.js',
  output: { path: path.resolve(__dirname, 'build/web'), filename: '[name].[contenthash].js', clean: true },
  resolve: { extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js'], alias: { 'react-native$': 'react-native-web' } },
  module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: { loader: 'builtin:swc-loader', options: {
    jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } },
  } } }] },
  plugins: [new HtmlRspackPlugin({ title: 'Leader Product 2.0 Fork', templateContent: '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' })],
};
