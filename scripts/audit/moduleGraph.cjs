// Static import evidence, including literal dynamic imports/require; not a runtime reachability proof.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const roots = ['app', 'src', 'context', 'hooks', 'utils', 'components', 'modules', 'plugins'];
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'build', '.git'].includes(item.name)) continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else if (/\.[jt]sx?$/.test(p)) files.push(p);
  }
}
roots.forEach(walk);
const domain = p => p.match(/^src\/features\/([^/]+)/)?.[1] || 'platform';
const edges = [];
const dynamic = [];
for (const file of files.sort()) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  function add(node, value, kind) {
    if (!value || !ts.isStringLiteralLike(value)) { dynamic.push({ file, line: source.getLineAndCharacterOfPosition(node.pos).line + 1 }); return; }
    const specifier = value.text;
    const target = specifier.startsWith('@/') ? specifier.slice(2) : specifier.startsWith('.') ? path.normalize(path.join(path.dirname(file), specifier)) : null;
    edges.push({ file, specifier, target, kind, from: domain(file), to: target ? domain(target) : 'external' });
  }
  function visit(n) {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) { if(n.moduleSpecifier) add(n, n.moduleSpecifier, 'static'); }
    if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) add(n, n.arguments[0], 'dynamic');
    ts.forEachChild(n, visit);
  }
  visit(source);
}
const violations = edges.filter(e => e.from !== 'platform' && e.to !== 'platform' && e.to !== 'external' && e.from !== e.to);
const report = { method: 'TypeScript AST; paths normalized, extensions/platform/index not resolved; includes type imports; dynamic non-literals require manual review', files: files.length, edges: edges.length, crossFeatureImports: violations, nonLiteralImports: dynamic };
fs.writeFileSync('docs/leader-product-2/module-graph.json', JSON.stringify(report, null, 2)+'\n');
console.log(`${files.length} files; ${edges.length} imports; ${violations.length} cross-feature imports; ${dynamic.length} nonliteral imports`);
