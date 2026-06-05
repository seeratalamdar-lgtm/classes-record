const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../node_modules/react-native/src/private/webapis/geometry/DOMRectReadOnly.js');

if (!fs.existsSync(file)) {
  console.log('DOMRectReadOnly.js not found, skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

if (!content.includes('#x')) {
  console.log('Already patched, skipping');
  process.exit(0);
}

content = content
  .replace('  #x: number;\n  #y: number;\n  #width: number;\n  #height: number;',
           '  _x: number;\n  _y: number;\n  _width: number;\n  _height: number;')
  .replace(/this\.#x/g, 'this._x')
  .replace(/this\.#y/g, 'this._y')
  .replace(/this\.#width/g, 'this._width')
  .replace(/this\.#height/g, 'this._height');

fs.writeFileSync(file, content, 'utf8');
console.log('SUCCESS: Patched DOMRectReadOnly.js');
