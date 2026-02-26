// JD Client (JDC) configuration template

export const JD_CLIENT_CONFIG_TEMPLATE = `# SRI JDC config

listening_address = "0.0.0.0:34265"


# Version support
max_supported_version = 2
min_supported_version = 2


# Auth keys for open encrypted connection downstream
authority_public_key = "{{AUTHORITY_PUBLIC_KEY}}"
authority_secret_key = "{{AUTHORITY_SECRET_KEY}}"
cert_validity_sec = 3600


# User identity/username for pool connection
user_identity = "{{USER_IDENTITY}}"


# How many shares we expect to receive in a minute (determines difficulty targets)
shares_per_minute = {{SHARES_PER_MINUTE}}


# How many shares do we want to acknowledge in a batch
share_batch_size = {{SHARE_BATCH_SIZE}}


# JDC supports two modes:
# "FULLTEMPLATE"  - full template mining
# "COINBASEONLY" - coinbase-only mining
mode = "FULLTEMPLATE"


# string to be added into the Coinbase scriptSig
jdc_signature = "{{JDC_SIGNATURE}}"


# Solo Mining config
# Coinbase output used to build the coinbase tx in case of Solo Mining (as last-resort solution of the pools fallback system)
#
# Coinbase outputs are specified as descriptors. A full list of descriptors is available at
#     https://github.com/bitcoin/bips/blob/master/bip-0380.mediawiki#appendix-b-index-of-script-expressions
# Although the \`musig\` descriptor is not yet supported and the legacy \`combo\` descriptor never
# will be. If you have an address, embed it in a descriptor like \`addr(<address here>)\`.
coinbase_reward_script = "addr({{COINBASE_REWARD_SCRIPT}})"


# Enable this option to set a predefined log file path.
# When enabled, logs will always be written to this file.
# The CLI option --log-file (or -f) will override this setting if provided.
# log_file = "./jd-client.log"


# Protocol Extensions Configuration
# Extensions that the JDC supports (will accept if requested by downstream clients)
# Comment/uncomment to enable/disable specific extensions:
supported_extensions = [
    0x0002,  # Worker-Specific Hashrate Tracking
]


# Extensions that the JDC requires (downstream clients must support these to connect)
# Use with caution - requiring extensions may prevent some clients from connecting
required_extensions = [
    # Example: require Worker-Specific Hashrate Tracking
    # 0x0002,
]


# Monitoring HTTP server address for exposing channel data (optional)
monitoring_address = "0.0.0.0:9091"

# List of upstreams (Pool and JDS) used as backup endpoints
# In case of shares refused by the Pool or JDS, the fallback system will propose the same job to the next upstream in this list
[[upstreams]]
authority_pubkey = "{{UPSTREAM_AUTHORITY_PUBKEY}}"
pool_address = "{{JDC_POOL_ADDRESS}}"
pool_port = {{JDC_POOL_PORT}}
jds_address = "{{JDC_UPSTREAM_JDS_ADDRESS}}"
jds_port = {{JDC_UPSTREAM_JDS_PORT}}

# [[upstreams]]
# authority_pubkey = "2di19GHYQnAZJmEpoUeP7C3Eg9TCcksHr23rZCC83dvUiZgiDL"
# pool_address = "127.0.0.1:34254"
# pool_port = "34254"
# jds_address = "127.0.0.1:34264"
# jds_port = "34264"

# Bitcoin Core IPC config
# Supported networks: mainnet, testnet4, signet, regtest
# Default data_dir: ~/.bitcoin (Linux) or ~/Library/Application Support/Bitcoin (macOS)
[template_provider_type.BitcoinCoreIpc]
network = "{{NETWORK}}"
{{DATA_DIR_LINE}}
fee_threshold = {{FEE_THRESHOLD}}
min_interval = {{MIN_INTERVAL}}`;
