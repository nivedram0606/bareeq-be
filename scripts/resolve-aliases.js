import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const sharedTarget = path.join(distDir, 'shared', 'index.js');

if (!fs.existsSync(distDir)) {
  console.error(`Dist directory not found at: ${distDir}`);
  process.exit(1);
}

let modifiedCount = 0;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes('@bareeq/shared')) {
        let rel = path.relative(path.dirname(fullPath), sharedTarget);
        if (!rel.startsWith('.')) rel = './' + rel;
        rel = rel.replace(/\\/g, '/');
        content = content.replace(/(from\s+['"])@bareeq\/shared(['"])/g, `$1${rel}$2`);
        content = content.replace(/(import\s*\(['"])@bareeq\/shared(['"]\))/g, `$1${rel}$2`);
        fs.writeFileSync(fullPath, content);
        modifiedCount++;
      }
    }
  }
}

walk(distDir);
console.log(`[resolve-aliases] Successfully resolved @bareeq/shared in ${modifiedCount} compiled files.`);
