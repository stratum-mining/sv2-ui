# SV2 UI

A unified setup wizard and monitoring dashboard for Stratum V2 mining.

## Quick Start

```bash
# Install dependencies (includes server workspace)
npm install

# Start frontend + backend
npm run dev
```

Then open **http://localhost:5173**. On first run, you'll be guided through the setup wizard.

## What It Does

1. **Setup Wizard** - Guides you through configuration
   - Choose Solo or Pool mining
   - Select a pool (Braiins, SRI, etc.)
   - Configure your username/Bitcoin address
   - For JD mode: configure Bitcoin Core connection

2. **Docker Orchestration** - Starts and manages containers
   - Translator Proxy (SV1 to SV2 translation)
   - JD Client (for custom block templates, optional)

3. **Monitoring Dashboard** - Real-time stats
   - Total hashrate from connected miners
   - Active workers
   - Shares to pool
   - Hashrate history chart

## Deployment Modes

**Pool Mining (No-JD)**
```
Pool ← Translator ← SV1 Miners
```

**Pool Mining with Job Declaration**
```
Pool ← JDC ← Translator ← SV1 Miners
        ↑
   Bitcoin Core (your node creates block templates)
```

**Solo Mining**
```
Solo Pool ← Translator ← SV1 Miners
```

## Supported Pools

| Pool | Mode | Status |
|------|------|--------|
| Braiins Pool | Pool (No-JD) | Available |
| SRI Pool | Pool (JD) | Testing |
| SRI Solo Pool | Solo | Available |
| Blitzpool | Solo | Coming Soon |

## Development

```bash
# Build for production
npm run build:all
```

### Project Structure

```
sv2-ui/
├── src/                    # React frontend
│   ├── components/
│   │   ├── setup/          # Setup wizard steps
│   │   ├── settings/       # Settings page components
│   │   ├── data/           # Dashboard components
│   │   └── ui/             # Base UI primitives
│   ├── hooks/              # React hooks
│   └── pages/              # Page components
├── server/                 # Node.js backend
│   └── src/
│       ├── index.ts        # Express API
│       ├── docker.ts       # Docker orchestration
│       └── config-generator.ts  # TOML config generation
├── Dockerfile              # Multi-stage build
└── public/                 # Static assets
```

### Docker Images Used

- `stratumv2/translator_sv2:main` - Translator Proxy
- `stratumv2/jd_client_sv2:main` - JD Client

## Ports

| Port | Service | Description |
|------|---------|-------------|
| 3000 | sv2-ui | Web UI |
| 34255 | Translator | SV1 miners connect here |
| 9092 | Translator | Monitoring API |
| 34265 | JDC | Translator connects here (JD mode) |
| 9091 | JDC | Monitoring API (JD mode) |

## Tech Stack

- **React 18** + **TypeScript** - Frontend
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Query** - Data fetching
- **Express** - Backend API
- **Dockerode** - Docker orchestration

## Related Projects

- [stratum-mining/sv2-apps](https://github.com/stratum-mining/sv2-apps) - Translator, JDC, Pool, JDS
- [stratum-mining/stratum](https://github.com/stratum-mining/stratum) - SV2 protocol implementation

## License

MIT OR Apache-2.0
