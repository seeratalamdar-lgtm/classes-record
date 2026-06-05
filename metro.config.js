const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add custom transformer to handle private class fields
const originalTransformerPath = config.transformer?.babelTransformerPath;

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('./scripts/metro-transformer.js'),
};

module.exports = config;
