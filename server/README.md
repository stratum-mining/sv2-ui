# SV2 UI Server

A lightweight Rust binary that serves the Stratum V2 monitoring dashboard.

## Features

- **Single executable** - UI assets embedded directly in the binary
- **Cross-platform** - Works on Linux, macOS, and Windows
- **Auto-opens browser** - Launches your default browser on startup
- **Minimal dependencies** - Small binary size (~5-10MB)

## Building

### Prerequisites

1. Build the UI assets first (from the parent directory):
   ```bash
   cd ..
   npm install
   npm run build
   ```

2. Then build the Rust server:
   ```bash
   cargo build --release
   ```

The binary will be at `target/release/sv2-ui`.

### One-liner Build

From the `sv2-ui` root directory:
```bash
npm run build && cd server && cargo build --release
```

## Usage

```bash
# Start with default settings (port 3000, opens browser)
./sv2-ui

# Custom port
./sv2-ui --port 8080

# Don't auto-open browser
./sv2-ui --no-open

# Bind to all interfaces (for remote access)
./sv2-ui --host 0.0.0.0

# Show help
./sv2-ui --help
```

## How It Works

1. The React UI is built to `../dist/` by `npm run build`
2. The Rust binary embeds all files from `../dist/` at compile time using `rust-embed`
3. At runtime, it serves these embedded files via an HTTP server
4. SPA routing is handled by falling back to `index.html` for non-file paths

## Configuration

The UI connects to Translator and JDC monitoring APIs. Configure via URL parameters:

```
http://localhost:3000/?translator_url=http://192.168.1.10:9092&jdc_url=http://192.168.1.10:9091
```

## Development

For development, use the Vite dev server instead (from parent directory):
```bash
npm run dev
```

The Rust server is intended for production distribution.
