/**
 * Setup wizard types
 */

export type MiningMode = 'solo' | 'pool';
export type SetupMode = 'jd' | 'no-jd';

export interface PoolConfig {
  name: string;
  address: string;
  port: number;
  authority_public_key: string;
}

export type OperatingSystem = 'linux' | 'macos';

export interface BitcoinConfig {
  network: 'mainnet' | 'testnet4';
  os: OperatingSystem;
  customDataDir: string;
  socket_path: string;
}

export interface JdcConfig {
  user_identity: string;
  jdc_signature: string;
  coinbase_reward_address: string;
}

export interface TranslatorConfig {
  user_identity: string;
  enable_vardiff: boolean;
  aggregate_channels: boolean;
  min_hashrate: number;
  shares_per_minute: number;
  downstream_extranonce2_size: number;
}

export interface SetupData {
  miningMode: MiningMode | null;
  mode: SetupMode | null;
  pool: PoolConfig | null;
  bitcoin: BitcoinConfig | null;
  jdc: JdcConfig | null;
  translator: TranslatorConfig | null;
}

export const initialSetupData: SetupData = {
  miningMode: null,
  mode: null,
  pool: null,
  bitcoin: null,
  jdc: null,
  translator: null,
};

export type SetupStep =
  | 'mining-mode'
  | 'template-mode'
  | 'pool'
  | 'bitcoin-prereq'
  | 'bitcoin'
  | 'hashrate'
  | 'identity'
  | 'review';

export interface StepProps {
  data: SetupData;
  updateData: (updates: Partial<SetupData>) => void;
  onNext: () => void;
  onBack: () => void;
}
