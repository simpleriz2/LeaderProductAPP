const path=require('node:path');
module.exports={mode:'development',target:'web',entry:'./dev/web/entry.ts',output:{path:path.join(__dirname,'build/web-test'),filename:'fixture.js',clean:true},devtool:false,module:{rules:[{test:/\.ts$/,exclude:/node_modules/,use:{loader:'builtin:swc-loader',options:{jsc:{parser:{syntax:'typescript'},target:'es2022'}}}}]},resolve:{extensions:['.ts','.js']}};
