import { Router, type Request, type Response } from 'express';
import {
  startBitcoin,
  stopBitcoin,
  getBitcoinStatus,
  getBitcoinLogs,
  getBuildLogs,
  getRegtestInfo,
  mineRegtestBlocks,
} from '../services/bitcoin-docker.service.js';
import type { BitcoinNetwork, BitcoinStartRequest } from '../types.js';

const router = Router();

function requireNetwork(param: unknown): BitcoinNetwork {
  if (param !== 'mainnet' && param !== 'testnet4' && param !== 'regtest') {
    throw new Error('Invalid network. Must be "mainnet", "testnet4", or "regtest".');
  }
  return param as BitcoinNetwork;
}

router.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const network = requireNetwork((req.body as BitcoinStartRequest).network);
    const result = await startBitcoin(network);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.startsWith('Invalid network')) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Bitcoin start failed:', message);
    res.status(500).json({ error: `Failed to start Bitcoin Core: ${message}` });
  }
});

router.post('/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    const network = requireNetwork((req.body as BitcoinStartRequest).network);
    await stopBitcoin(network);
    res.json({ status: 'stopped' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.startsWith('Invalid network')) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Bitcoin stop failed:', message);
    res.status(500).json({ error: `Failed to stop Bitcoin Core: ${message}` });
  }
});

router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const network = requireNetwork(req.query.network);
    const status = await getBitcoinStatus(network);
    res.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.startsWith('Invalid network')) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Bitcoin status failed:', message);
    res.status(500).json({ error: `Failed to get Bitcoin status: ${message}` });
  }
});

router.get('/build-logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const network = requireNetwork(req.query.network);
    const logs = getBuildLogs(network);
    res.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.startsWith('Invalid network')) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Bitcoin build-logs failed:', message);
    res.status(500).json({ error: `Failed to get build logs: ${message}` });
  }
});

router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const network = requireNetwork(req.query.network);
    const tail = parseInt(req.query.tail as string, 10) || 100;
    const logs = await getBitcoinLogs(network, tail);
    res.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.startsWith('Invalid network')) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Bitcoin logs failed:', message);
    res.status(500).json({ error: `Failed to get Bitcoin logs: ${message}` });
  }
});

router.get('/regtest-info', async (_req: Request, res: Response): Promise<void> => {
  try {
    const info = await getRegtestInfo();
    res.json(info);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Failed to get regtest info: ${message}` });
  }
});

router.post('/regtest-mine', async (req: Request, res: Response): Promise<void> => {
  try {
    const { blocks: numBlocks = 1, address } = req.body;
    const result = await mineRegtestBlocks(numBlocks, address);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Failed to mine blocks: ${message}` });
  }
});

export default router;
