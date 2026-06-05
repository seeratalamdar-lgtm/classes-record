const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Force Babel to transform react-native private class fields (DOMRectReadOnly etc.)
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: false,
};

// Ensure react-native internal files with private class fields are transpiled
const originalTransformIgnore = config.transformer?.transformIgnorePatterns || [];
config.transformer.transformIgnorePatterns = [
  'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|unimodules|react-navigation|@react-navigation|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-keyboard-controller|@react-native-community|react-native-worklets)/).*',
];

module.exports = config;
