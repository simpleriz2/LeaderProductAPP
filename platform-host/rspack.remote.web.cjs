const path=require('node:path');
const {DefinePlugin,optimize}=require('@rspack/core');
const {ModuleFederationPlugin}=require('@module-federation/enhanced/rspack');
const name=process.env.LP2_REMOTE,version=process.env.LP2_PROBE_VERSION||'1.0.0';
const profile=process.env.LP2_REMOTE_PROFILE||'probe';
if(!['probe','business'].includes(profile))throw Error('Unknown remote profile');
const business=profile==='business';
if(business&&name!=='qr')throw Error('Business profile available only for QR');
if(!['qr','help'].includes(name))throw Error('LP2_REMOTE must be qr or help');
module.exports={mode:'production',target:'web',devtool:false,entry:{},
 output:{path:path.resolve(__dirname,'build/compiled-web-remotes',name),uniqueName:`lp2_${name}`,publicPath:'',chunkLoading:false,clean:true},
 resolve:{extensions:['.web.tsx','.web.ts','.tsx','.ts','.js'],alias:{'react-native$':'react-native-web'}},
 module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:{loader:'builtin:swc-loader',options:{jsc:{parser:{syntax:'typescript',tsx:true},transform:{react:{runtime:'automatic'}}}}}}]},
 optimization:{splitChunks:false,runtimeChunk:false},
 plugins:[new DefinePlugin({__LP2_MODULE_VERSION__:JSON.stringify(version),__LP2_PROBE_VERSION__:JSON.stringify(version),__LP2_PROBE_FAIL_STARTUP__:process.env.LP2_PROBE_FAIL_STARTUP==='true'}),new optimize.LimitChunkCountPlugin({maxChunks:1}),new ModuleFederationPlugin({
  name:`lp2_${name}`,filename:`${name}.container.js`,library:{type:'var',name:`lp2_${name}`},manifest:false,dts:false,
  exposes:business?{'./Module':'./modules/qr/module.tsx'}:{'./Screen':`./remotes/${name}.tsx`},
  shared:{react:{singleton:true,requiredVersion:'19.3.0',strictVersion:true,import:false},'react-native':{singleton:true,requiredVersion:'0.21.4',strictVersion:true,import:false}},
 })]};
