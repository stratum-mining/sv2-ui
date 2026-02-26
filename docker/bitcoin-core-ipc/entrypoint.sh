#!/bin/bash
set -e

RPC_USER="${RPC_USER:-stratum}"
RPC_PASSWORD="${RPC_PASSWORD:-stratum123}"
NETWORK="${NETWORK:-mainnet}"

# Determine config file path based on network
if [ "$NETWORK" = "mainnet" ]; then
    CONF_FILE="/home/bitcoin/.bitcoin/bitcoin.conf"
else
    CONF_FILE="/home/bitcoin/.bitcoin/$NETWORK/bitcoin.conf"
fi

# Setup as root
if [ "$(id -u)" = '0' ]; then
    mkdir -p /home/bitcoin/.bitcoin/ipc

    # Create network-specific directory if needed
    if [ "$NETWORK" != "mainnet" ]; then
        mkdir -p "/home/bitcoin/.bitcoin/$NETWORK"
    fi

    # Remove stale root-level bitcoin.conf if using a network-specific one
    if [ "$NETWORK" != "mainnet" ] && [ -f "/home/bitcoin/.bitcoin/bitcoin.conf" ]; then
        rm -f /home/bitcoin/.bitcoin/bitcoin.conf
    fi

    # Create default bitcoin.conf if it doesn't exist
    if [ ! -f "$CONF_FILE" ]; then
        echo "Creating default bitcoin.conf at $CONF_FILE..."

        if [ "$NETWORK" = "mainnet" ]; then
            cat > "$CONF_FILE" <<EOF
server=1
rpcuser=$RPC_USER
rpcpassword=$RPC_PASSWORD
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0
ipcbind=unix:/home/bitcoin/.bitcoin/ipc/node.sock
prune=550
txindex=0
dbcache=450
maxmempool=300
EOF
        else
            SECTION_NAME="$NETWORK"
            RPC_PORT=$(if [ "$NETWORK" = "testnet4" ]; then echo 48332; elif [ "$NETWORK" = "regtest" ]; then echo 18443; else echo 8332; fi)

            cat > "$CONF_FILE" <<EOF
server=1
chain=$NETWORK

[$SECTION_NAME]
rpcuser=$RPC_USER
rpcpassword=$RPC_PASSWORD
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0
rpcport=$RPC_PORT
ipcbind=unix:/home/bitcoin/.bitcoin/ipc/node.sock
prune=550
txindex=0
dbcache=450
maxmempool=300
EOF

            # Regtest-specific settings
            if [ "$NETWORK" = "regtest" ]; then
                echo "fallbackfee=0.00001" >> "$CONF_FILE"
            fi
        fi
    fi

    chown -R bitcoin:bitcoin /home/bitcoin

    # For regtest: use bitcoind first for wallet setup (bitcoin-node has no wallet module),
    # then switch to bitcoin-node for IPC socket support (needed by JDC template provider)
    if [ "$NETWORK" = "regtest" ]; then
        gosu bitcoin bitcoind "-conf=$CONF_FILE" "$@" &
        BITCOIN_PID=$!

        echo "Waiting for Bitcoin Core RPC..."
        for i in $(seq 1 30); do
            if gosu bitcoin bitcoin-cli -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport=18443 getblockchaininfo > /dev/null 2>&1; then
                echo "RPC is ready."
                break
            fi
            sleep 1
        done

        # Create wallet (skip if already exists from a previous run)
        if ! gosu bitcoin bitcoin-cli -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport=18443 getwalletinfo > /dev/null 2>&1; then
            echo "Creating regtest wallet..."
            gosu bitcoin bitcoin-cli -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport=18443 createwallet "regtest" || \
                gosu bitcoin bitcoin-cli -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport=18443 loadwallet "regtest" || true
        fi

        # Mine 101 blocks if chain is empty (first start)
        BLOCKS=$(gosu bitcoin bitcoin-cli -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport=18443 getblockcount 2>/dev/null || echo "0")
        if [ "${BLOCKS}" -lt 101 ]; then
            ADDRESS=$(gosu bitcoin bitcoin-cli -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport=18443 getnewaddress "mining" "bech32")
            echo "Mining 101 blocks to ${ADDRESS}..."
            gosu bitcoin bitcoin-cli -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport=18443 generatetoaddress 101 "${ADDRESS}" > /dev/null
            BALANCE=$(gosu bitcoin bitcoin-cli -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport=18443 getbalance)
            echo "Regtest ready. Address: ${ADDRESS}, Balance: ${BALANCE} BTC"
        else
            echo "Regtest chain already has ${BLOCKS} blocks, skipping initial mining."
        fi

        # Stop bitcoind and switch to bitcoin-node for IPC socket support
        echo "Stopping bitcoind, switching to bitcoin-node for IPC..."
        kill $BITCOIN_PID
        wait $BITCOIN_PID 2>/dev/null || true
        sleep 1

        exec gosu bitcoin bitcoin-node "-conf=$CONF_FILE" "$@"
    else
        exec gosu bitcoin bitcoin-node "-conf=$CONF_FILE" "$@"
    fi
fi
