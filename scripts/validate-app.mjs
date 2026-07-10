import { readFileSync } from 'node:fs';
const files = ['index.html', 'src/main.js', 'src/styles.css', 'docs/transportos-phase-0-spec.md', 'docs/app-preview.svg'];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) throw new Error(`${file} is empty`);
}
const html = readFileSync('index.html', 'utf8');
if (!html.includes('src/main.js')) throw new Error('index.html must load src/main.js');
const app = readFileSync('src/main.js', 'utf8');
for (const required of ['TransportOS', 'Create Trip', 'Control Tower', 'Mark Empty/Available', 'Fuel Transactions Stub']) {
  if (!app.includes(required)) throw new Error(`Missing required UI text: ${required}`);
}
console.log('TransportOS demo files validated.');
