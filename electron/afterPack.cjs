const { execFileSync } = require('child_process');
const path = require('path');

// electron-builder's own --deep --strict codesign verify fails when this repo
// lives in a cloud-synced folder (Synology Drive's FileProvider extension injects
// com.apple.fileprovider.dir# xattrs into every directory), so signing is disabled
// via "identity": null in package.json. Apple Silicon still requires *some* code
// signature to launch, so ad-hoc sign here instead, after packaging is done in the
// local (non-synced) output directory.
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlements = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'templates', 'entitlements.mac.plist');
  const helperPath = path.join(appPath, 'Contents', 'Resources', 'native', 'display-helper');

  execFileSync('xattr', ['-cr', appPath]);
  // electron-builder's extraResources copy doesn't guarantee the exec bit survives.
  execFileSync('chmod', ['+x', helperPath]);
  // Sign the helper binary *before* the deep app sign below — the app-level seal
  // records a hash of every resource at sign time, so re-signing the helper
  // afterwards (changing its bytes) would invalidate that seal and fail
  // `codesign --verify --deep --strict`. It needs no special entitlements (those
  // are V8-specific) — a bare ad-hoc signature is enough for Gatekeeper's
  // "is this code signed at all" check on Apple Silicon.
  execFileSync('codesign', ['--force', '--sign', '-', helperPath]);
  // Ad-hoc sign with the JIT/unsigned-memory entitlements Electron's V8 needs —
  // a bare `codesign --sign -` strips entitlements and crashes Electron's renderer.
  execFileSync('codesign', [
    '--force', '--deep', '--sign', '-',
    '--entitlements', entitlements,
    '--options', 'runtime',
    appPath,
  ]);
};
