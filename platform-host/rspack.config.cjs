const Repack = require('@callstack/repack');
module.exports = Repack.defineRspackConfig({
  context: __dirname,
  experiments: { parallelLoader: false },
  entry: './index.js',
  resolve: Repack.getResolveOptions({ enablePackageExports: true }),
  module: { rules: [
    { test: /\.[cm]?[jt]sx?$/, type: 'javascript/auto', use: { loader: '@callstack/repack/babel-swc-loader', options: {} } },
    ...Repack.getAssetTransformRules(),
  ] },
  output: { uniqueName: 'lp2Host' },
  plugins: [new Repack.RepackPlugin(), new Repack.plugins.ModuleFederationPluginV2({
    name: 'lp2Host', dts: false,
    shared: {
      react: { singleton: true, eager: true, requiredVersion: '19.3.0', strictVersion: true },
      'react-native': { singleton: true, eager: true, requiredVersion: '0.88.1', strictVersion: true },
    },
  })],
});
