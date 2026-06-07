const fs = require('fs');
const path = require('path');

function patchGradle(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.log(`${label}: not found at ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  content = content.replace(
    /version = System\.getenv\("CMAKE_VERSION"\) \?: "3\.22\.1"/g,
    '// cmake version removed'
  );
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Patched ${label}`);
  } else {
    console.log(`${label}: pattern not found (already patched or different)`);
  }
}

patchGradle(
  path.join(__dirname, '../node_modules/react-native-worklets/android/build.gradle'),
  'react-native-worklets'
);
patchGradle(
  path.join(__dirname, '../node_modules/react-native-reanimated/android/build.gradle'),
  'react-native-reanimated'
);
