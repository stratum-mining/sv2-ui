# SV2 UI

A unified monitoring dashboard for the SRI stack.

## Overview

This UI provides real-time monitoring for SV2 mining deployments:

- **Translator Proxy** - Translates SV1 miners to SV2
- **JD Client** - Enables Job Declaration Protocol with custom block templates

### Deployment Modes

**Non-JD Mode (Translator Only)**
```
Pool ── Translator ── SV1 Clients (legacy miners)
```

**JD Mode (JDC + Translator)**
```
Pool ── JDC ── Translator ── SV1 Clients
            ↖── Native SV2 miners (optional)
```

The UI **automatically detects** which mode is active.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

Then open http://localhost:5173

## Configuration

### Endpoint URLs

Configure where JDC and Translator are running:

**URL Parameters (runtime):**
```
http://localhost:5173/?jdc_url=http://192.168.1.10:9091&translator_url=http://192.168.1.10:9092
```

**Environment Variables (build time):**
```bash
VITE_JDC_URL=http://localhost:9091 \
VITE_TRANSLATOR_URL=http://localhost:9092 \
npm run build
```

**Defaults:**
- JDC: `http://localhost:9091`
- Translator: `http://localhost:9092`

### Backend Requirements

The monitoring APIs must be enabled in your SV2 applications:

```toml
# translator-config.toml
monitoring_address = "0.0.0.0:9092"

# jdc-config.toml (if using JD mode)
monitoring_address = "0.0.0.0:9091"
```

## Features

### Dashboard
- **Total Hashrate** - Combined hashrate from all connected clients
- **Active Workers** - Number of SV1 clients connected
- **Shares to Pool** - Accepted/submitted shares with acceptance rate
- **Best Difficulty** - Highest difficulty share submitted
- **Hashrate Chart** - Real-time hashrate history

### Pool Stats
- Detailed upstream connection information
- Channel-level statistics
- Share work sum and acceptance metrics

### Settings
- Connection status for all services
- Endpoint configuration display
- API documentation links

## Development

### Prerequisites
- Node.js 18+
- npm 9+

### Project Structure

```
sv2-ui/
├── src/
│   ├── components/
│   │   ├── ui/              # Base UI primitives
│   │   ├── data/            # Data display components
│   │   └── layout/          # Shell, navigation
│   ├── hooks/
│   │   ├── usePoolData.ts   # Main data hook (auto-detects mode)
│   │   └── useHashrateHistory.ts
│   ├── pages/
│   │   ├── UnifiedDashboard.tsx
│   │   ├── PoolStats.tsx
│   │   └── Settings.tsx
│   ├── types/
│   │   └── api.ts           # TypeScript types matching Rust API
│   └── lib/
│       └── utils.ts         # Formatting utilities
├── public/
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

### Running with Live Backends

1. Start your SV2 applications with monitoring enabled
2. Run `npm run dev`
3. The UI auto-detects available services

### CORS During Development

The Vite dev server proxies API requests to avoid CORS issues:
- `/jdc-api/*` → `http://localhost:9091/api/*`
- `/translator-api/*` → `http://localhost:9092/api/*`

### Building for Embedding

The built UI can be embedded directly into Rust binaries:

```bash
npm run build
# Output in dist/
```

See [stratum-apps](https://github.com/stratum-mining/sv2-apps) for embedding instructions.

## API Endpoints Consumed

| Endpoint | Source | Description |
|----------|--------|-------------|
| `/api/v1/health` | Both | Health check |
| `/api/v1/global` | JDC or Translator | Global stats |
| `/api/v1/server/channels` | JDC or Translator | Upstream pool channels |
| `/api/v1/clients` | JDC only | SV2 clients list |
| `/api/v1/clients/{id}/channels` | JDC only | SV2 client channels |
| `/api/v1/sv1/clients` | Translator only | SV1 clients list |
| `/metrics` | Both | Prometheus metrics |
| `/swagger-ui` | Both | Interactive API docs |

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Query** - Data fetching with auto-refresh
- **Recharts** - Charts
- **wouter** - Lightweight routing

## Related Projects

- [stratum-mining/sv2-apps](https://github.com/stratum-mining/sv2-apps) - Translator Proxy, JD Client, Pool, JDS
- [stratum-mining/stratum](https://github.com/stratum-mining/stratum) - SV2 protocol implementation

## License

MIT OR Apache-2.0
