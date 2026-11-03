/* Static scan: find className strings containing light-only bg/text classes with
 * no dark: counterpart anywhere in the same string. Flags candidate white
 * flashbacks in dark mode. High-signal filter: only bg-/text- backgrounds that
 * would visually clash. */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = 'src';
const EXT = ['.tsx', '.ts'];
const TOKEN = /--(background|surface|card|elevated|border|text)/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXT.includes(extname(e))) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const hits = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // capture template-literal or quoted class values
  const re = /class(Name)?=("|'|\{`)?([\s\S]{0,600}?)("|'|`\})/g;
  let m;
  while ((m = re.exec(src))) {
    const cls = m[3];
    if (!cls || cls.length > 600) continue;
    // skip token-var based utility strings (they adapt automatically)
    if (cls.includes('var(--') && !/\bbg-(white|gray-\d|slate-\d|green-\d+|red-\d+|amber-\d+|yellow-\d+)\b/.test(cls)) continue;
    const LIGHT_BG = cls.match(/\bbg-(white|gray-50|gray-100|slate-50|slate-100)\b/g) || [];
    if (LIGHT_BG.length && !cls.includes('dark:')) {
      hits.push({ file: f, sample: cls.slice(0, 180) });
    }
  }
}
console.log(`scanned ${files.length} files, ${hits.length} candidates`);
const byFile = {};
for (const h of hits) (byFile[h.file] ||= []).push(h.sample);
for (const [f, arr] of Object.entries(byFile)) console.log(`\n${f} (${arr.length})\n  ` + arr.slice(0, 4).join('\n  '));
