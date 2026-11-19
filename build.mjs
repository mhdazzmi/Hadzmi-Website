// Build: menggabungkan src/ menjadi satu file index.html (siap Blogspot / hosting statis)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const css = readFileSync(join(src, 'styles.css'), 'utf8');
const js = readdirSync(join(src, 'js')).filter(f => f.endsWith('.js')).sort()
  .map(f => `/* ---- ${f} ---- */\n` + readFileSync(join(src, 'js', f), 'utf8')).join('\n');
if (/<\/script/i.test(js)) throw new Error('JS must not contain a closing script tag');
let html = readFileSync(join(src, 'index.html'), 'utf8');
html = html.split('/*__INLINE_CSS__*/').join(css).split('//__INLINE_JS__').join(js);
writeFileSync(join(root, 'index.html'), html);
console.log(`index.html built: ${(html.length / 1024).toFixed(1)} KB`);
