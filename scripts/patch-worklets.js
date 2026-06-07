const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '../patches/worklets-build.gradle');
const dst = path.join(__dirname, '../node_modules/react-native-worklets/android/build.gradle');
if (fs.existsSync(dst) && fs.existsSync(src)) {
  fs.copyFileSync(src, dst);
  console.log('Patched react-native-worklets build.gradle');
} else {
  console.log('Source or dest not found:', src, dst);
}
