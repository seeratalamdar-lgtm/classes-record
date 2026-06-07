const fs = require('fs');
const f = require('path').join(__dirname, '../node_modules/react-native-worklets/android/build.gradle');
if (fs.existsSync(f)) {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/version = System\.getenv\("CMAKE_VERSION"\) \?: "3\.22\.1"/g, '// cmake version removed');
  fs.writeFileSync(f, c);
  console.log('Patched react-native-worklets cmake version requirement');
}
