import { Router } from 'express';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseTOML, stringify as stringifyTOML } from 'smol-toml';
import { generateKeypair } from '../services/keygen.service.js';
import { CONFIG_DIR, CONFIG_FILES } from '../constants.js';

const router = Router();

/**
 * POST /api/keys/generate — return a fresh Noise authority keypair.
 *
 * Also patches the tProxy config on disk so its first upstream's
 * authority_pubkey stays in sync with JDC's new public key.
 */
router.post('/generate', async (_req, res) => {
  try {
    const keypair = generateKeypair();

    // Best-effort: update tProxy's upstream authority_pubkey to match
    try {
      const tproxyPath = path.join(CONFIG_DIR, CONFIG_FILES.tproxy);
      const raw = await readFile(tproxyPath, 'utf-8');
      const parsed = parseTOML(raw) as Record<string, any>;
      const upstreams = parsed.upstreams as Array<Record<string, any>> | undefined;
      if (upstreams && upstreams.length > 0) {
        upstreams[0].authority_pubkey = keypair.publicKey;
        await writeFile(tproxyPath, stringifyTOML(parsed), 'utf-8');
      }
    } catch {
      // tProxy config may not exist yet — that's fine
    }

    res.json(keypair);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Key generation failed' });
  }
});

export default router;
