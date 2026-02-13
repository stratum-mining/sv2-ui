# SV2 UI

A unified monitoring dashboard for the SRI stack, featuring an integrated deployment wizard.

## Overview

This UI provides:

- **Real-time Monitoring** - Dashboard for SV2 mining deployments
- **Deployment Wizard** - Interactive setup guide powered by [sv2-wizard](https://github.com/stratum-mining/sv2-wizard)

### Components Monitored

- **Translator Proxy** - Translates SV1 miners to SV2
- **Job Declarator Client (JDC)** - Enables Job Declaration Protocol with custom block templates

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

The UI **automatically detects** which mode is active and shows a setup wizard when no services are connected.

## Quick Start

### Standalone Binary (Recommended)

Download the `sv2-ui` binary from releases and run:

```bash
./sv2-ui
```

This will:
- Start a web server on port 3000
- Open your browser automatically
- Show the setup wizard if no Translator/JDC is detected

**Options:**
```bash
./sv2-ui --port 8080      # Custom port
./sv2-ui --no-open        # Don't auto-open browser
./sv2-ui --host 0.0.0.0   # Allow remote access
```

### Docker

```bash
docker run -p 3000:80 ghcr.io/stratum-mining/sv2-ui:latest
```

Then open http://localhost:3000

### Connecting to Remote Services

If your Translator/JDC are on a different machine, use URL parameters:
```
http://localhost:3000/?translator_url=http://192.168.1.10:9092&jdc_url=http://192.168.1.10:9091
```

### Building from Source

**Prerequisites:** Node.js 18+ and Rust 1.85+

```bash
# Clone the repo
git clone https://github.com/stratum-mining/sv2-ui.git
cd sv2-ui

# Build the UI
npm install
npm run build

# Build the server binary
cd server
cargo build --release

# The binary is at: target/release/sv2-ui
```

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Then open http://localhost:5173

## Deployment Options

### Option 1: Docker with Nginx (Recommended)

The UI runs as a container that proxies API requests to JDC and Translator:

```
Browser :3000 ──► Nginx ──┬──► /jdc-api/* ──► JDC :9091
                          └──► /translator-api/* ──► Translator :9092
```

**Steps:**

1. Update backend addresses in `deploy/nginx.conf` if needed
2. Build and run:
   ```bash
   docker compose up --build
   ```

**Connecting to sv2-apps network:**

If JDC and Translator are running in a separate Docker Compose (sv2-apps), connect to their network:

```yaml
# docker-compose.yml
networks:
  default:
    name: sv2-apps_default
    external: true
```

### Option 2: Static Files + Any Web Server

Build the UI and serve with any web server that can proxy API requests:

```bash
npm run build
# Output in dist/
```

Then configure your web server to:
1. Serve `dist/` as static files
2. Proxy `/jdc-api/*` to JDC (port 9091)
3. Proxy `/translator-api/*` to Translator (port 9092)
4. Return `index.html` for all other routes (SPA)

### Option 3: Direct CORS (Development/Testing)

If JDC and Translator have CORS headers enabled, you can serve the UI from anywhere and pass backend URLs as parameters:

```
http://localhost:3000/?jdc_url=http://192.168.1.10:9091&translator_url=http://192.168.1.10:9092
```

## Configuration

### Endpoint URLs

The UI determines backend URLs in this priority order:

1. **URL Parameters** (runtime):
   ```
   ?jdc_url=http://192.168.1.10:9091&translator_url=http://192.168.1.10:9092
   ```

2. **Environment Variables** (build time):
   ```bash
   VITE_JDC_URL=http://192.168.1.10:9091 \
   VITE_TRANSLATOR_URL=http://192.168.1.10:9092 \
   npm run build
   ```

3. **Default Proxy Paths**: `/jdc-api` and `/translator-api` (for Nginx deployment)

### Backend Requirements

The monitoring APIs must be enabled in your SV2 applications:

```toml
# translator-config.toml
monitoring_address = "0.0.0.0:9092"

# jdc-config.toml (if using JD mode)
monitoring_address = "0.0.0.0:9091"
```

## Features

### Setup Wizard
When no SV2 services are detected, the UI automatically shows a setup guide with:
- **Deployment Wizard** - Interactive step-by-step setup powered by sv2-wizard
- Pool selection (SRI Community Pool, Braiins, DMND)
- Network selection (Mainnet/Testnet4)
- JD vs non-JD mode configuration
- Docker or binary deployment options
- Configuration file generation

### Dashboard
- **Total Hashrate** - Combined hashrate from all connected clients
- **Active Workers** - Number of SV1 clients connected
- **Shares to Pool** - Accepted/submitted shares with acceptance rate
- **Best Difficulty** - Highest difficulty share submitted
- **Hashrate Chart** - Real-time hashrate history (persists across page reloads)

### Pool Stats
- Detailed upstream connection information
- Channel-level statistics
- Share work sum and acceptance metrics

### Settings
- Connection status for all services
- Endpoint configuration display
- API documentation links
- Custom logo configuration

## Development

### Prerequisites
- Node.js 18+
- npm 9+

### Running with Live Backends

1. Start your SV2 applications with monitoring enabled
2. Run `npm run dev`
3. The UI auto-detects available services

### CORS During Development

The Vite dev server proxies API requests to avoid CORS issues:
- `/jdc-api/*` → `http://localhost:9091/api/*`
- `/translator-api/*` → `http://localhost:9092/api/*`

## Project Structure

```
sv2-ui/
├── deploy/
│   └── nginx.conf          # Nginx proxy configuration
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Docker Compose for UI service
├── src/
│   ├── components/
│   │   ├── ui/             # Base UI primitives
│   │   ├── data/           # Data display components
│   │   └── layout/         # Shell, navigation
│   ├── hooks/
│   │   ├── usePoolData.ts  # Main data hook (auto-detects mode)
│   │   ├── useApi.ts       # API client utilities
│   │   └── useHashrateHistory.ts
│   ├── pages/
│   │   ├── UnifiedDashboard.tsx
│   │   ├── PoolStats.tsx
│   │   └── Settings.tsx
│   └── types/
│       └── api.ts          # TypeScript types matching Rust API
└── vite.config.ts
```

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

- [stratum-mining/sv2-apps](https://github.com/stratum-mining/sv2-apps) - Translator Proxy, Job Declarator Client, Pool, JDS
- [stratum-mining/stratum](https://github.com/stratum-mining/stratum) - SV2 protocol implementation

## License

MIT OR Apache-2.0
