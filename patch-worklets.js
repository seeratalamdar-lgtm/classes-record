const fs = require('fs');
const path = 'node_modules/react-native-worklets/lib/module/initializers.js';
if (fs.existsSync(path)) {
  let content = fs.readFileSync(path, 'utf8');
  // Fix the variable naming conflict
  content = content.replace(/var (_\$\$\_IMPORT_ALL2).*?\n/g, '// $1 removed\n');
  fs.writeFileSync(path, content);
  console.log('Patched worklets');
}
