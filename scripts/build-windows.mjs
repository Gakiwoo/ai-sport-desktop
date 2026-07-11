import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  throw new Error('tauri:build:windows must run on Windows');
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetDir = path.resolve(
  process.env.CARGO_TARGET_DIR || path.join(os.tmpdir(), 'ai-sport-desktop-cargo-target'),
);
const localConfig = JSON.stringify({
  bundle: {
    createUpdaterArtifacts: false,
  },
});
const command = process.execPath;
const tauriCli = path.join(projectRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const args = [tauriCli, 'build', '--bundles', 'nsis', '--ci', '--no-sign', '--config', localConfig];

console.log(`Cargo target: ${targetDir}`);
const result = spawnSync(command, args, {
  cwd: projectRoot,
  env: {
    ...process.env,
    CARGO_TARGET_DIR: targetDir,
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const bundleDir = path.join(targetDir, 'release', 'bundle', 'nsis');
const installers = fs.existsSync(bundleDir)
  ? fs
      .readdirSync(bundleDir)
      .filter((name) => name.toLowerCase().endsWith('.exe'))
      .map((name) => path.join(bundleDir, name))
  : [];

if (installers.length === 0) {
  throw new Error(`Tauri completed without an NSIS installer in ${bundleDir}`);
}

for (const installer of installers) {
  const size = fs.statSync(installer).size;
  console.log(`NSIS installer: ${installer} (${size} bytes)`);
}
