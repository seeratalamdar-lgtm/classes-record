const upstreamTransformer = require('@expo/metro-config/babel-transformer');

module.exports.transform = async function(params) {
  if (params.filename && params.filename.includes('node_modules') && params.src) {
    if (/#[a-zA-Z_]/.test(params.src)) {
      params = {
        ...params,
        src: params.src
          // Replace ALL private field declarations (with or without indentation)
          .replace(/(\s)#([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '$1_$2')
          // Replace private field access: "this.#fieldName"
          .replace(/\bthis\.#([a-zA-Z_][a-zA-Z0-9_]*)\b/g, 'this._$1'),
      };
    }
  }
  return upstreamTransformer.transform(params);
};
