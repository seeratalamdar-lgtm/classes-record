const fs = require('fs');
const path = require('path');

const workletsFile = 'node_modules/react-native-worklets/lib/module/initializers.js';

if (fs.existsSync(workletsFile)) {
  let content = fs.readFileSync(workletsFile, 'utf8');
  
  // Replace the problematic variable naming
  content = content.replace(
    /var (_\$\$_\w+)(\s*=\s*\(function\(\)\{[\s\S]*?\n\}\)\(\));/g,
    'var $1$2'
  );
  
  // Alternative: comment out the problematic section
  if (content.includes('_$$_IMPORT_ALL2')) {
    content = content.replace(
      /function _\$_\$_IMPORT_ALL2[^}]*\}/,
      'function _$_$_IMPORT_ALL2() { return {}; }'
    );
  }
  
  fs.writeFileSync(workletsFile, content);
  console.log('✓ Patched react-native-worklets');
} else {
  console.log('Worklets file not found');
}
