# Bitcoin Core v30.2 with IPC support
# Uses official pre-built binaries — no compilation needed

FROM debian:bookworm-slim

# Install runtime dependencies and download tools
RUN apt-get update && apt-get install -y \
    gosu \
    curl \
    libevent-2.1-7 \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

# Download and extract official Bitcoin Core v30.2 binaries
RUN curl -fsSL https://bitcoincore.org/bin/bitcoin-core-30.2/bitcoin-30.2-x86_64-linux-gnu.tar.gz \
    | tar -xz -C /opt/ \
    && ln -s /opt/bitcoin-30.2/bin/bitcoind /usr/local/bin/bitcoind \
    && ln -s /opt/bitcoin-30.2/bin/bitcoin-cli /usr/local/bin/bitcoin-cli \
    && ln -s /opt/bitcoin-30.2/bin/bitcoin-wallet /usr/local/bin/bitcoin-wallet \
    && ln -s /opt/bitcoin-30.2/libexec/bitcoin-node /usr/local/bin/bitcoin-node

# Create bitcoin user
RUN groupadd -r bitcoin && useradd -r -m -g bitcoin bitcoin

WORKDIR /home/bitcoin

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8332 8333 18443 18444 48332 48333

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=60s \
    CMD bitcoin-cli -rpcuser=${RPC_USER:-stratum} -rpcpassword=${RPC_PASSWORD:-stratum123} getblockchaininfo || exit 1

ENTRYPOINT ["/entrypoint.sh"]
