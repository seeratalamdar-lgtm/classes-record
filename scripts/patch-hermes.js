const fs = require('fs');
const path = require('path');

const files = [
  'node_modules/react-native/src/private/webapis/geometry/DOMRectReadOnly.js',
  'node_modules/react-native/src/private/webapis/geometry/DOMRect.js',
  'node_modules/react-native/src/private/webapis/geometry/DOMRectList.js',
  'node_modules/react-native/Libraries/Animated/nodes/AnimatedNode.js',
  'node_modules/react-native/Libraries/Animated/nodes/AnimatedValue.js',
  'node_modules/react-native/Libraries/Animated/nodes/AnimatedTransform.js',
  'node_modules/react-native/Libraries/Animated/nodes/AnimatedObject.js',
  'node_modules/react-native/Libraries/Animated/nodes/AnimatedStyle.js',
  'node_modules/react-native/Libraries/Animated/nodes/AnimatedProps.js',
  'node_modules/react-native/Libraries/Animated/animations/Animation.js',
  'node_modules/react-native/Libraries/vendor/emitter/EventEmitter.js',
  'node_modules/react-native/Libraries/Debugging/DebuggingOverlayRegistry.js',
];

let patchedCount = 0;

for (const relPath of files) {
  const filePath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(filePath)) {
    console.log('NOT FOUND:', relPath);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Find all private field names used in this file
  const privateFields = new Set();
  const matches = content.matchAll(/#([a-zA-Z_][a-zA-Z0-9_]*)/g);
  for (const m of matches) {
    privateFields.add(m[1]);
  }

  if (privateFields.size === 0) {
    console.log('No private fields:', relPath);
    continue;
  }

  console.log('Patching', relPath, '- fields:', [...privateFields].join(', '));

  // Replace private field declarations and usages
  for (const field of privateFields) {
    // Replace declarations: #field: type; or #field =
    content = content.replace(new RegExp(`#${field}\\b`, 'g'), `_${field}`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  patchedCount++;
  console.log('  DONE');
}

console.log(`\nPatched ${patchedCount} files successfully.`);
