const fs = require('fs');
const path = require('path');

// Patch 1: DOMRectReadOnly private class fields for Hermes
const domRectFile = path.join(__dirname, '../node_modules/react-native/src/private/webapis/geometry/DOMRectReadOnly.js');
if (fs.existsSync(domRectFile)) {
  let content = fs.readFileSync(domRectFile, 'utf8');
  if (content.includes('#x')) {
    content = content
      .replace(/this\.#x/g, 'this._x')
      .replace(/this\.#y/g, 'this._y')
      .replace(/this\.#width/g, 'this._width')
      .replace(/this\.#height/g, 'this._height')
      .replace(/#x\b/g, '_x')
      .replace(/#y\b/g, '_y')
      .replace(/#width\b/g, '_width')
      .replace(/#height\b/g, '_height');
    fs.writeFileSync(domRectFile, content, 'utf8');
    console.log('SUCCESS: Patched DOMRectReadOnly.js');
  } else {
    console.log('DOMRectReadOnly.js already patched');
  }
} else {
  console.log('DOMRectReadOnly.js not found, skipping');
}

// Patch 2: Fix reanimated CMake version (3.22.1 not available on EAS)
const reanimatedGradle = path.join(__dirname, '../node_modules/react-native-reanimated/android/build.gradle');
if (fs.existsSync(reanimatedGradle)) {
  let content = fs.readFileSync(reanimatedGradle, 'utf8');
  if (content.includes('"3.22.1"')) {
    content = content.replace(/"3\.22\.1"/g, '"3.18.1"');
    fs.writeFileSync(reanimatedGradle, content, 'utf8');
    console.log('SUCCESS: Patched reanimated CMake version to 3.18.1');
  } else {
    console.log('reanimated CMake already patched');
  }
} else {
  console.log('reanimated build.gradle not found, skipping');
}
