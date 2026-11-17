const Repack = require('@callstack/repack');
const {DefinePlugin}=require('@rspack/core');
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
  plugins: [new DefinePlugin({__LP2_LOCAL_PROFILE__:JSON.stringify(require('./scripts/localWebProfile.cjs').readLocalWebProfile(process.env.LP2_HOST_PROFILE))}),new Repack.RepackPlugin(), new Repack.plugins.ModuleFederationPluginV2({
    name: 'lp2Host', dts: false,
    defaultRuntimePlugins: [],
    runtimePlugins: [require.resolve('./runtime/verifiedNativeEntry.ts')],
    shared: {
      react: { singleton: true, eager: true, requiredVersion: '19.3.0', strictVersion: true },
      'react-native': { singleton: true, eager: true, requiredVersion: '0.88.1', strictVersion: true },
    },
  })],
});
