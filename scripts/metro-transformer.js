const upstreamTransformer = require('@expo/metro-config/babel-transformer');
const babel = require('@babel/core');
const t = babel.types;

function tryParse(src, filename) {
  const pluginSets = [
    ['classProperties', 'classPrivateProperties', 'classPrivateMethods'],
    ['flow', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
    ['typescript', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
  ];
  for (const plugins of pluginSets) {
    try {
      return babel.parseSync(src, {
        filename: filename || 'unknown.js',
        configFile: false,
        babelrc: false,
        parserOpts: { plugins, allowReturnOutsideFunction: true },
      });
    } catch (e) {}
  }
  return null;
}

function renamePrivateFields(src, filename) {
  const ast = tryParse(src, filename);
  if (!ast) return null;
  let modified = false;
  babel.traverse(ast, {
    ClassPrivateProperty(path) {
      modified = true;
      const name = path.node.key.id.name;
      path.replaceWith(t.classProperty(
        t.identifier('_' + name), path.node.value,
        path.node.typeAnnotation, path.node.decorators,
        false, path.node.static
      ));
    },
    ClassPrivateMethod(path) {
      modified = true;
      const name = path.node.key.id.name;
      path.replaceWith(t.classMethod(
        path.node.kind, t.identifier('_' + name),
        path.node.params, path.node.body,
        false, path.node.static, path.node.generator, path.node.async
      ));
    },
    MemberExpression(path) {
      if (t.isPrivateName(path.node.property)) {
        modified = true;
        path.node.property = t.identifier('_' + path.node.property.id.name);
        path.node.computed = false;
      }
    },
  });
  if (!modified) return null;
  try {
    const result = babel.transformFromAstSync(ast, src, {
      configFile: false, babelrc: false, compact: false, sourceMaps: false, plugins: [],
    });
    return result ? result.code : null;
  } catch (e) { return null; }
}

module.exports.transform = async function(params) {
  const fn = params.filename || '';
  const isTS = fn.endsWith('.ts') || fn.endsWith('.tsx');
  if (!isTS && fn.includes('node_modules') && params.src && params.src.includes('#')) {
    try {
      const transformed = renamePrivateFields(params.src, params.filename);
      if (transformed) params = { ...params, src: transformed };
    } catch (e) {}
  }
  return upstreamTransformer.transform(params);
};
