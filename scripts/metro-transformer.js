const upstreamTransformer = require('@expo/metro-config/babel-transformer');

module.exports.transform = async function(params) {
  if (params.filename && params.filename.includes('node_modules/react-native')) {
    if (params.src && params.src.includes('#')) {
      params = {
        ...params,
        src: params.src.replace(/#([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '_$1'),
      };
    }
  }
  return upstreamTransformer.transform(params);
};
