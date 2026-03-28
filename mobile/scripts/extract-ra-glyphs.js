const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(
  path.join(__dirname, '../../web/node_modules/rpg-awesome/css/rpg-awesome.css'),
  'utf8'
);

// Match patterns like:  .ra-something:before {\n  content: "X";\n}
// where X is the literal unicode character
const re = /\.ra-([\w-]+):before\s*\{\s*content:\s*"(.)"/gms;
let m;
const map = {};
while ((m = re.exec(css)) !== null) {
  const name = 'ra-' + m[1];
  const cp = m[2].codePointAt(0);
  map[name] = cp;
}

// Output as a TS map
const keys = Object.keys(map).sort();
console.log('// Auto-generated RPG Awesome icon codepoint map');
console.log('// Total icons:', keys.length);
console.log('export const RA_GLYPHS: Record<string, number> = {');
for (const k of keys) {
  console.log(`  '${k}': 0x${map[k].toString(16)},`);
}
console.log('};');
