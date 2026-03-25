# SV2 UI

A unified setup wizard and monitoring dashboard for Stratum V2 mining.

## Quick Start (Docker)

```bash
docker run --rm \
  --name sv2-ui \
  -p 8080:8080 \
  -e HOST_HOME=$HOME \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v sv2-config:/app/data/config \
  stratumv2/sv2-ui:v0.3.1
```

Then open **http://localhost:8080**. On first run, you'll be guided through the setup wizard.

**Flags explained:**
- `--rm` removes the container on exit so you can re-run without conflicts
- `-e HOST_HOME=$HOME` is required for JD mode to locate your Bitcoin Core socket
- `-v /var/run/docker.sock:...` lets sv2-ui manage Translator and JDC containers
- `-v sv2-config:/app/data/config` persists your configuration across restarts

Stopping with **Ctrl+C** will also stop the Translator and JDC containers automatically.

### macOS (Docker Desktop)

```bash
docker run --rm --name sv2-ui -p 8080:8080 \
  -e HOST_HOME=$HOME \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v sv2-config:/app/data/config \
  stratumv2/sv2-ui:v0.3.1
```

### macOS (Colima / OrbStack)

Mount the appropriate Docker socket for your setup:

```bash
# Colima
docker run --rm --name sv2-ui -p 8080:8080 \
  -e HOST_HOME=$HOME \
  -v $HOME/.colima/default/docker.sock:/var/run/docker.sock \
  -v sv2-config:/app/data/config \
  stratumv2/sv2-ui:v0.3.1

# OrbStack
docker run --rm --name sv2-ui -p 8080:8080 \
  -e HOST_HOME=$HOME \
  -v $HOME/.orbstack/run/docker.sock:/var/run/docker.sock \
  -v sv2-config:/app/data/config \
  stratumv2/sv2-ui:v0.3.1
```

## Development

```bash
# Install dependencies (includes server workspace)
npm install

# Make sure Docker Desktop / Docker Engine is running

# Start frontend + backend
npm run dev
```

Then open **http://localhost:5173**. On first run, you'll be guided through the setup wizard.

The backend auto-detects common local Docker sockets, including `/var/run/docker.sock` and `~/.docker/run/docker.sock`. To override detection, set `DOCKER_SOCKET_PATH` or `DOCKER_HOST` before starting the server.

## What It Does

1. **Setup Wizard** - Guides you through configuration
   - Choose Solo or Pool mining
   - Select a pool (Braiins, SRI Solo Pool, Blitzpool, etc.)
   - Set the expected hashrate for initial difficulty tuning
   - Configure your username/Bitcoin address
   - For JD mode: select OS, Bitcoin network, and auto-compute the IPC socket path

2. **Docker Orchestration** - Starts and manages containers
   - Translator Proxy (SV1 to SV2 translation)
   - JD Client (for custom block templates, optional)
   - Graceful shutdown: Ctrl+C stops all containers

3. **Monitoring Dashboard** - Real-time stats
   - Pool connection status (e.g. "Connected to Braiins")
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
| SRI Solo Pool | Pool (JD) / Solo | Testing |
| Blitzpool | Solo | Coming Soon |

## Building the Docker Image

```bash
docker build -t sv2-ui:test .

docker run --rm --name sv2-ui -p 8080:8080 \
  -e HOST_HOME=$HOME \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v sv2-config:/app/data/config \
  sv2-ui:test
```

## Project Structure

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
│       ├── index.ts        # Express API + graceful shutdown
│       ├── docker.ts       # Docker orchestration
│       └── config-generator.ts  # TOML config generation
├── Dockerfile              # Multi-stage build (with tini for signal handling)
└── public/                 # Static assets
```

## Docker Images Used

- `stratumv2/translator_sv2:v0.3.1` - Translator Proxy
- `stratumv2/jd_client_sv2:v0.3.1` - JD Client

## Ports

| Port | Service | Description |
|------|---------|-------------|
| 8080 | sv2-ui (Docker) | Web UI |
| 5173 | sv2-ui (dev) | Vite dev server |
| 3001 | sv2-ui (dev) | Backend API |
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
