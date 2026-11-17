const Repack = require('@callstack/repack');
const path = require('node:path');
const { DefinePlugin } = require('@rspack/core');
const name = process.env.LP2_REMOTE;
const version = process.env.LP2_PROBE_VERSION || '1.0.0';
if (!['qr', 'help'].includes(name)) throw Error('LP2_REMOTE must be qr or help');
module.exports = Repack.defineRspackConfig(({platform}) => ({
  context: __dirname,
  entry: './remotes/entry.js',
  output: { uniqueName: name, path: path.resolve(__dirname, 'build/compiled-remotes', name, platform), clean: true },
  resolve: Repack.getResolveOptions({ enablePackageExports: true }),
  experiments: { parallelLoader: false },
  module: { rules: [
    { test: /\.[cm]?[jt]sx?$/, type: 'javascript/auto', use: { loader: '@callstack/repack/babel-swc-loader', options: {} } },
    ...Repack.getAssetTransformRules(),
  ] },
  plugins: [new DefinePlugin({ __LP2_PROBE_VERSION__: JSON.stringify(version), __LP2_PROBE_FAIL_STARTUP__: false }), new Repack.RepackPlugin({ extraChunks: [{ type: 'remote', outputPath: path.resolve(__dirname, 'build/remote-packages', name, platform) }] }), new Repack.plugins.ModuleFederationPluginV2({
    manifest: { additionalData: ({stats}) => { stats.metaData.buildInfo.buildVersion = version; return stats; } },
    name, filename: `${name}.container.bundle`, dts: false,
    exposes: { './Screen': `./remotes/${name}.tsx` },
    shared: {
      react: { singleton: true, eager: false, requiredVersion: '19.3.0', strictVersion: true },
      'react-native': { singleton: true, eager: false, requiredVersion: '0.88.1', strictVersion: true },
    },
  })],
}));
