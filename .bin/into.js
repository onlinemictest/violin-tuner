#!/usr/bin/env node

import { resolve } from 'path';
import { promises as fs } from 'fs';

async function read(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk); 
  return Buffer.concat(chunks).toString('utf8');
}

(async () => {
  try {
    const [,, regex, o] = process.argv;
    const out = resolve(o);
    const [stdin, a] = await Promise.all([
      read(process.stdin), 
      fs.readFile(out, 'utf-8')
    ]);
    const c = a.replace(new RegExp(regex), stdin.trimRight());
    await fs.writeFile(out, c, 'utf-8');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
