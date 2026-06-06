const upstreamTransformer = require('@expo/metro-config/babel-transformer');
const babel = require('@babel/core');

module.exports.transform = async function(params) {
  if (params.filename && params.filename.includes('node_modules') && params.src && /#[a-zA-Z_]/.test(params.src)) {
    try {
      const result = babel.transformSync(params.src, {
        filename: params.filename,
        configFile: false,
        babelrc: false,
        presets: [],
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
        ],
        compact: false,
        sourceMaps: false,
      });
      params = { ...params, src: result.code };
    } catch (e) {
      // Keep original if transform fails
    }
  }
  return upstreamTransformer.transform(params);
};
