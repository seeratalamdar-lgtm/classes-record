const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('./scripts/metro-transformer.js'),
};
module.exports = config;
