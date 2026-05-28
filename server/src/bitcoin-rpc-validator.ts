export const bitcoinRpcValidatorScript = `const http = require('http');
const fs = require('fs');

const dataDir = process.argv[1];
const network = process.argv[2] || 'mainnet';
const host = process.argv[3] || 'localhost';
const port = Number(process.argv[4]);

if (!dataDir || !port) {
  console.error('Usage: node script.js <data-dir> <network> <host> <port>');
  process.exit(1);
}

const cookiePath = network === 'testnet4'
  ? dataDir + '/testnet4/.cookie'
  : dataDir + '/.cookie';

function parseBitcoinConf(filePath, targetNetwork) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\\n');

  let currentSection = 'global';
  let globalCreds = { rpcuser: null, rpcpassword: null };
  let networkCreds = { rpcuser: null, rpcpassword: null };
  let foundNetworkSection = false;

  const networkSectionName = targetNetwork === 'mainnet' ? 'main' : targetNetwork;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionMatch = trimmed.match(/^\\[(.+)\\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (currentSection === networkSectionName) {
        foundNetworkSection = true;
      }
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();

    if (key === 'rpcuser' || key === 'rpcpassword') {
      if (currentSection === 'global') {
        if (key === 'rpcuser') globalCreds.rpcuser = value;
        if (key === 'rpcpassword') globalCreds.rpcpassword = value;
      } else if (currentSection === networkSectionName) {
        if (key === 'rpcuser') networkCreds.rpcuser = value;
        if (key === 'rpcpassword') networkCreds.rpcpassword = value;
      }
    }
  }

  if (foundNetworkSection && networkCreds.rpcuser && networkCreds.rpcpassword) {
    return networkCreds;
  }

  if (globalCreds.rpcuser && globalCreds.rpcpassword) {
    return globalCreds;
  }

  return null;
}

let authValue = null;

try {
  const content = fs.readFileSync(cookiePath, 'utf8').trim();
  const colonIndex = content.indexOf(':');
  if (colonIndex === -1) {
    throw new Error('Invalid cookie file format');
  }
  authValue = content;
} catch (err) {
  if (err.code === 'ENOENT') {
    const bitcoinConfPath = dataDir + '/bitcoin.conf';
    try {
      const creds = parseBitcoinConf(bitcoinConfPath, network);
      if (!creds || !creds.rpcuser || !creds.rpcpassword) {
        console.error('No authentication method found');
        process.exit(1);
      }
      authValue = creds.rpcuser + ':' + creds.rpcpassword;
    } catch (confErr) {
      console.error('No authentication method found');
      process.exit(1);
    }
  } else {
    console.error('Failed to read cookie file:', err.message);
    process.exit(1);
  }
}

function makeRpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '1.0',
      id: 'sv2-ui-validator',
      method: method,
      params: params,
    });

    const options = {
      hostname: host,
      port: port,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': 'Basic ' + Buffer.from(authValue).toString('base64'),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(JSON.stringify(parsed.error)));
          } else {
            resolve(parsed.result);
          }
        } catch (err) {
          reject(new Error('Failed to parse response: ' + data));
        }
      });
    });

    req.on('error', (err) => { reject(err); });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(postData);
    req.end();
  });
}

(async () => {
  try {
    const blockchainInfo = await makeRpcCall('getblockchaininfo', []);
    const networkInfo = await makeRpcCall('getnetworkinfo', []);
    const rpcInfo = await makeRpcCall('getrpcinfo', []);

    const result = {
      chain: blockchainInfo.chain,
      initialblockdownload: blockchainInfo.initialblockdownload,
      version: networkInfo.version,
      logpath: rpcInfo.logpath,
    };

    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
`;
