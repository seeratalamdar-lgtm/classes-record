const upstreamTransformer = require('@expo/metro-config/babel-transformer');

module.exports.transform = async function(params) {
  if (params.filename && params.filename.includes('node_modules') && params.src) {
    if (/#[a-zA-Z_]/.test(params.src)) {
      params = {
        ...params,
        src: params.src
          .replace(/\bthis\.#([a-zA-Z_][a-zA-Z0-9_]*)\b/g, 'this._$1')
          .replace(/([{;,\n\r])(\s*)#([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '$1$2_$3'),
      };
    }
  }
  return upstreamTransformer.transform(params);
};
