const Repack = require('@callstack/repack');
const base = require('./rspack.config.cjs');
const name = process.env.LP2_REMOTE;
if (!['qr', 'help'].includes(name)) throw Error('LP2_REMOTE must be qr or help');
module.exports = Repack.defineRspackConfig({
  context: __dirname,
  entry: './remotes/entry.js',
  output: { uniqueName: name },
  resolve: Repack.getResolveOptions({ enablePackageExports: true }),
  experiments: { parallelLoader: false },
  module: { rules: [
    { test: /\.[cm]?[jt]sx?$/, type: 'javascript/auto', use: { loader: '@callstack/repack/babel-swc-loader', options: {} } },
    ...Repack.getAssetTransformRules(),
  ] },
  plugins: [new Repack.RepackPlugin(), new Repack.plugins.ModuleFederationPluginV2({
    name, filename: `${name}.container.bundle`, dts: false,
    exposes: { './Screen': `./remotes/${name}.tsx` },
    shared: {
      react: { singleton: true, eager: false, requiredVersion: '19.3.0', strictVersion: true },
      'react-native': { singleton: true, eager: false, requiredVersion: '0.88.1', strictVersion: true },
    },
  })],
});
