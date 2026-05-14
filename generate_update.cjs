/**
 * MINUS LAG - Update Package Generator
 * Run this AFTER a successful build to generate the files needed for GitHub releases.
 * Usage: node generate_update.cjs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const VERSION = '1.0.3';
const PRIVATE_KEY_PATH = path.join(__dirname, 'src-tauri', 'updater-key.key');
const PRIVATE_KEY_PASSWORD = 'Niyaamitraj321@';
const MSI_PATH = path.join(__dirname, `src-tauri/target/release/bundle/msi/MINUS LAG_${VERSION}_x64_en-US.msi`);
const NSIS_PATH = path.join(__dirname, `src-tauri/target/release/bundle/nsis/MINUS LAG_${VERSION}_x64-setup.exe`);
const OUTPUT_DIR = path.join(__dirname, 'release_output');
const GITHUB_REPO = 'https://github.com/Steushio/MINUSLAG/releases/download/v' + VERSION;

// ---- Helpers ----
function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function zipFile(inputPath, outputPath) {
  // Use PowerShell to zip the file
  run(`powershell -Command "Compress-Archive -Path '${inputPath}' -DestinationPath '${outputPath}' -Force"`);
}

function signFile(filePath) {
  const cmd = `cmd /c npx tauri signer sign --private-key-path "${PRIVATE_KEY_PATH}" --password "${PRIVATE_KEY_PASSWORD}" "${filePath}"`;
  return run(cmd);
}

// ---- Main ----
console.log('=== MINUS LAG Update Package Generator ===\n');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

console.log('📦 Zipping MSI...');
const msiZipName = `MINUS LAG_${VERSION}_x64_en-US.msi.zip`;
const msiZipPath = path.join(OUTPUT_DIR, msiZipName);
zipFile(MSI_PATH, msiZipPath);
console.log(`   ✅ Created: ${msiZipName}`);

console.log('\n🔏 Signing MSI zip...');
let msiSig;
try {
  msiSig = signFile(msiZipPath);
  // Extract just the base64 sig (last line of output)
  msiSig = msiSig.split('\n').pop().trim();
  console.log(`   ✅ Signed.`);
} catch (e) {
  console.error('   ❌ Signing failed:', e.message);
  process.exit(1);
}

console.log('\n📦 Zipping NSIS...');
const nsisZipName = `MINUS LAG_${VERSION}_x64-setup.exe.zip`;
const nsisZipPath = path.join(OUTPUT_DIR, nsisZipName);
zipFile(NSIS_PATH, nsisZipPath);
console.log(`   ✅ Created: ${nsisZipName}`);

console.log('\n🔏 Signing NSIS zip...');
let nsisSig;
try {
  nsisSig = signFile(nsisZipPath);
  nsisSig = nsisSig.split('\n').pop().trim();
  console.log(`   ✅ Signed.`);
} catch (e) {
  console.error('   ❌ Signing failed:', e.message);
  process.exit(1);
}

// Also copy the plain installers to output dir
fs.copyFileSync(MSI_PATH, path.join(OUTPUT_DIR, `MINUS LAG_${VERSION}_x64_en-US.msi`));
fs.copyFileSync(NSIS_PATH, path.join(OUTPUT_DIR, `MINUS LAG_${VERSION}_x64-setup.exe`));

console.log('\n📝 Generating latest.json...');
const pubDate = new Date().toISOString();
const latestJson = {
  version: VERSION,
  notes: `MINUS LAG v${VERSION} - Performance improvements and bug fixes.`,
  pub_date: pubDate,
  platforms: {
    "windows-x86_64": {
      signature: msiSig,
      url: `${GITHUB_REPO}/${encodeURIComponent(msiZipName)}`
    }
  }
};

const latestJsonPath = path.join(OUTPUT_DIR, 'latest.json');
fs.writeFileSync(latestJsonPath, JSON.stringify(latestJson, null, 2));
console.log(`   ✅ Created: latest.json`);

console.log('\n✨ Done! Upload these files to your GitHub release v' + VERSION + ':');
console.log('   📁 release_output/');
fs.readdirSync(OUTPUT_DIR).forEach(f => console.log(`       - ${f}`));

console.log(`
🚀 GitHub Release Steps:
   1. Go to https://github.com/Steushio/MINUSLAG/releases/new
   2. Set tag to: v${VERSION}
   3. Upload ALL files from the release_output/ folder
   4. Publish the release

Your app will auto-update within minutes!
`);
