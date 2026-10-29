#!/usr/bin/env node
/**
 * Prisma CLI environment bridge.
 *
 * The Prisma CLI only reads `backend/.env`, but this project keeps developer
 * secrets in `.env.local` (gitignored) and names the Mongo connection string
 * `MONGODB_URI`, while the schema requires `DATABASE_URL`. This wrapper applies
 * the same loading and aliasing rules as `src/config/index.ts` so that
 * `prisma generate / db push / studio / seed` see identical configuration.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const backendRoot = path.resolve(__dirname, '..');

for (const file of ['.env.local', '.env']) {
  const fullPath = path.join(backendRoot, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
  }
}

if (!process.env.DATABASE_URL && process.env.MONGODB_URI) {
  process.env.DATABASE_URL = process.env.MONGODB_URI;
}

if (!process.env.DATABASE_URL) {
  console.error(
    '\n  Missing database connection string.\n\n' +
      '  Set DATABASE_URL (or MONGODB_URI) in backend/.env.local:\n' +
      '    MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/fdr_portal\n'
  );
  process.exit(1);
}

const candidates = [
  path.join(backendRoot, 'node_modules', '.bin', 'prisma'),
  path.join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js'),
];

let command;
let args;

const binPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!binPath) {
  console.error('Prisma CLI not found. Run `pnpm install` first.');
  process.exit(1);
}

if (binPath.endsWith('.js')) {
  command = process.execPath;
  args = [binPath, ...process.argv.slice(2)];
} else {
  command = binPath;
  args = process.argv.slice(2);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  cwd: backendRoot,
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
