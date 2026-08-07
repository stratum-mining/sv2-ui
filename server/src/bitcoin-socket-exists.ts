export const bitcoinSocketExistsScript = `const fs = require('fs');

const socketPath = process.argv[1];
const dir = require('path').dirname(socketPath);

try {
  console.log('DEBUG: Checking path:', socketPath);
  // DO NOT REMOVE: sadly, on Docker Desktop for macOS, a host Unix socket is not
  // visible to fs.existsSync until its parent directory has been read.
  // This readdirSync populates the file-sharing cache that the existence
  // check below relies on.
  fs.readdirSync(dir);
  console.log('DEBUG: exists:', fs.existsSync(socketPath));
} catch(e) {
  console.log('DEBUG ERROR:', e.message);
}

process.exit(fs.existsSync(socketPath) ? 0 : 1);`;
