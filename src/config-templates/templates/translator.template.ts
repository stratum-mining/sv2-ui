// Translator Proxy configuration template

export const TRANSLATOR_CONFIG_TEMPLATE = `# Local Mining Device Downstream Connection
downstream_address = "0.0.0.0"
downstream_port = 34255


# Version support
max_supported_version = 2
min_supported_version = 2


# Extranonce2 size for downstream connections
# This controls the rollable part of the extranonce for downstream miners
# Max value for CGminer: 8
# Min value: 2
downstream_extranonce2_size = 4


# User identity/username for pool connection
# This will be appended with a counter for each mining client (e.g., username.miner1, username.miner2)
user_identity = "{{USER_IDENTITY}}"


# Aggregate channels: if true, all miners share one upstream channel; if false, each miner gets its own channel
aggregate_channels = {{AGGREGATE_CHANNELS}}


# Enable this option to set a predefined log file path.
# When enabled, logs will always be written to this file.
# The CLI option --log-file (or -f) will override this setting if provided.
# log_file = "./tproxy.log"


{{SUPPORTED_EXTENSIONS_BLOCK}}


{{REQUIRED_EXTENSIONS_BLOCK}}

# Monitoring HTTP server address for exposing channel data (optional)
monitoring_address = "0.0.0.0:9092"

# Difficulty params
[downstream_difficulty_config]
# hashes/s of the weakest miner that will be connecting (e.g.: 10 Th/s = 10_000_000_000_000.0)
min_individual_miner_hashrate= {{MIN_INDIVIDUAL_MINER_HASHRATE}}
# target number of shares per minute the miner should be sending
shares_per_minute = {{SHARES_PER_MINUTE}}
# enable variable difficulty adjustment (true by default, set to false when using with JDC)
enable_vardiff = {{ENABLE_VARDIFF}}
# Interval in seconds for sending keepalive jobs to prevent miner timeout during low upstream activity (set to 0 to disable)
job_keepalive_interval_secs = 60

[[upstreams]]
address = "{{UPSTREAM_ADDRESS}}"
port = {{UPSTREAM_PORT}}
authority_pubkey = "{{AUTHORITY_PUBLIC_KEY}}"`;
