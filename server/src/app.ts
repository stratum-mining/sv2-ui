import express from 'express';
import cors from 'cors';
import setupRouter from './routes/setup.js';
import statusRouter from './routes/status.js';
import controlRouter from './routes/control.js';
import bitcoinRouter from './routes/bitcoin.js';
import wizardDataRouter from './routes/wizard-data.js';
import configRouter from './routes/config.js';
import logsRouter from './routes/logs.js';
import checkSocketRouter from './routes/check-socket.js';
import updateRouter from './routes/update.js';
import keysRouter from './routes/keys.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/setup', setupRouter);
app.use('/api/status', statusRouter);
app.use('/api/bitcoin', bitcoinRouter);
app.use('/api/wizard-data', wizardDataRouter);
app.use('/api/config', configRouter);
app.use('/api/logs', logsRouter);
app.use('/api/check-socket', checkSocketRouter);
app.use('/api/update', updateRouter);
app.use('/api/keys', keysRouter);
app.use('/api', controlRouter);

export default app;
