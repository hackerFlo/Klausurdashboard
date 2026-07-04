const { execFileSync } = require('child_process');
const path = require('path');
const { app } = require('electron');

const isWindows = process.platform === 'win32';

function helperPath() {
  const file = isWindows ? 'display-helper.ps1' : 'display-helper';
  return app.isPackaged
    ? path.join(process.resourcesPath, 'native', file)
    : path.join(__dirname, 'native', file);
}

function invocation(command, payload) {
  if (!isWindows) {
    return { file: helperPath(), args: payload === undefined ? [command] : [command, payload] };
  }
  // powershell.exe -File mangles quoted JSON arguments, so the saved-state
  // payload travels base64-encoded and is decoded inside the script.
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath(), command];
  if (payload !== undefined) args.push(Buffer.from(payload, 'utf8').toString('base64'));
  return { file: 'powershell.exe', args };
}

function run(command, payload) {
  try {
    const { file, args } = invocation(command, payload);
    const out = execFileSync(file, args, { encoding: 'utf8', windowsHide: true });
    return JSON.parse(out);
  } catch (err) {
    console.error('[display-helper]', command, 'failed:', err.message);
    return { ok: false, error: String(err.message) };
  }
}

module.exports = {
  getStatus: () => run('status'),
  extend: () => run('extend'),
  restore: (savedState) => run('restore', JSON.stringify(savedState)),
};
