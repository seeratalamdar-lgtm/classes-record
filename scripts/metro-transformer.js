const upstreamTransformer = require('@expo/metro-config/build/transformer/default-transformer');

module.exports.transform = async function(params) {
  // Replace private class fields with underscore equivalents before Babel processes them
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
