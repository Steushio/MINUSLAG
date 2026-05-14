const { execSync } = require('child_process');
const path = require('path');

process.env.TAURI_SIGNING_PRIVATE_KEY = path.join(__dirname, 'src-tauri', 'updater-key.key');
process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = 'Niyaamitraj321@';

console.log('Starting signed build with key:', process.env.TAURI_SIGNING_PRIVATE_KEY);

try {
  execSync('npm run tauri build', { stdio: 'inherit' });
} catch (e) {
  console.error('Build failed');
  process.exit(1);
}
