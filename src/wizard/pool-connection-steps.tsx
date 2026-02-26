import type { WizardConfig } from "@/wizard/framework";
import {
  Box, Terminal, Layers, Cloud, Zap, Globe, Activity
} from "lucide-react";
import {
  BitcoinSetupContent,
  TranslatorProxyConfigForm,
  ClientConfigForm,
  DeploymentResultContent,
  WizardIntro,
} from "@/wizard/components";
import { getPoolConfig } from "@/config-templates/pools";

export const POOL_CONNECTION_WIZARD_CONFIG: WizardConfig = {
  initialStepId: 'welcome',
  title: "Pool Connection Wizard",
  subtitle: "Connect your miners to Stratum V2 pools through SRI proxies. Choose whether to use pool templates or construct your own.",
  steps: {
    welcome: {
      id: 'welcome',
      type: 'instruction',
      title: "Welcome",
      nextStepId: 'block_template_construction',
      component: <WizardIntro />,
      wide: true,
    },
    block_template_construction: {
      id: 'block_template_construction',
      type: 'question',
      title: "Block Template Construction",
      description: "Would you like to construct your own block templates? (Requires a Bitcoin Core node)",
      options: [
        { id: 'opt_own', label: "Yes, construct my own", subLabel: "I have a Bitcoin Core node", value: "yes", nextStepId: "bitcoin_network_selection", icon: Layers },
        { id: 'opt_pool_tpl', label: "No, use pool's templates", subLabel: "Standard mining setup", value: "no", nextStepId: "pool_network_selection", icon: Cloud }
      ]
    },
    pool_network_selection: {
      id: 'pool_network_selection',
      type: 'question',
      title: "Select Bitcoin Network",
      description: "Which network is the pool operating on?",
      options: [
        { id: 'opt_main', label: "Mainnet", subLabel: "Production Network", value: "mainnet", nextStepId: "select_pool_all_mainnet", icon: Globe },
        { id: 'opt_test', label: "Testnet4", subLabel: "Testing Network", value: "testnet4", nextStepId: "select_pool_all_testnet4", icon: Activity },
        { id: 'opt_regtest', label: "Regtest", subLabel: "Local Development", value: "regtest", nextStepId: "select_pool_all_regtest", icon: Activity }
      ]
    },
    bitcoin_network_selection: {
      id: 'bitcoin_network_selection',
      type: 'question',
      title: "Select Bitcoin Network",
      description: "Which network will your Bitcoin Node operate on?",
      options: [
        { id: 'opt_main', label: "Mainnet", subLabel: "Production Network", value: "mainnet", nextStepId: "bitcoin_guide_mainnet", icon: Globe },
        { id: 'opt_test', label: "Testnet4", subLabel: "Testing Network", value: "testnet4", nextStepId: "bitcoin_guide_testnet", icon: Activity },
        { id: 'opt_regtest', label: "Regtest", subLabel: "Local Development", value: "regtest", nextStepId: "bitcoin_guide_regtest", icon: Activity }
      ]
    },
    bitcoin_guide_mainnet: {
      id: 'bitcoin_guide_mainnet',
      type: 'instruction',
      title: "Bitcoin Core Setup (Mainnet)",
      nextStepId: 'select_pool_construct_mainnet',
      component: <BitcoinSetupContent network="mainnet" showBitcoinConf={false} />
    },
    bitcoin_guide_testnet: {
      id: 'bitcoin_guide_testnet',
      type: 'instruction',
      title: "Bitcoin Core Setup (Testnet4)",
      nextStepId: 'select_pool_construct_testnet4',
      component: <BitcoinSetupContent network="testnet4" showBitcoinConf={false} />
    },
    bitcoin_guide_regtest: {
      id: 'bitcoin_guide_regtest',
      type: 'instruction',
      title: "Bitcoin Core Setup (Regtest)",
      nextStepId: 'select_pool_construct_regtest',
      component: <BitcoinSetupContent network="regtest" showBitcoinConf={false} />
    },
    select_pool_construct_mainnet: {
      id: 'select_pool_construct_mainnet',
      type: 'question',
      title: "Select Mining Pool",
      description: "Choose a pool that supports custom block templates.",
      options: [
        {
          id: 'pool_sri',
          label: "Community SRI Pool",
          subLabel: "Community Hosted Stratum V2 Reference Implementation",
          value: "community_sri",
          nextStepId: "jd_client_configuration",
          icon: Globe,
          iconUrl: getPoolConfig("community_sri")?.iconUrl,
          badge: "Testing",
          badgeColor: "blue",
          warning: "Not for production use \u2013 any blocks found will be donated to the SRI project"
        },
        {
          id: 'pool_blitzpool',
          label: "Blitzpool",
          subLabel: "Public, no fees, fully SV2 compatible",
          value: "blitzpool",
          nextStepId: "jd_client_configuration",
          icon: Zap,
          iconUrl: getPoolConfig("blitzpool")?.iconUrl
        },
        {
          id: 'pool_demand',
          label: "DMND",
          value: "demand",
          nextStepId: "jd_client_configuration",
          icon: Zap,
          iconUrl: getPoolConfig("demand")?.iconUrl,
          warning: "Pool for registered businesses only at the moment",
          disabled: true,
          url: "https://dmnd.work/"
        }
      ]
    },
    select_pool_construct_testnet4: {
      id: 'select_pool_construct_testnet4',
      type: 'question',
      title: "Select Mining Pool",
      description: "Choose a pool that supports custom block templates.",
      options: [
        {
          id: 'pool_sri',
          label: "Community SRI Pool",
          subLabel: "Community Hosted Stratum V2 Reference Implementation",
          value: "community_sri",
          nextStepId: "jd_client_configuration",
          icon: Globe,
          iconUrl: getPoolConfig("community_sri")?.iconUrl,
          badge: "Testing",
          badgeColor: "blue",
          warning: "Not for production use \u2013 any blocks found will be donated to the SRI project"
        }
      ]
    },
    select_pool_construct_regtest: {
      id: 'select_pool_construct_regtest',
      type: 'question',
      title: "Select Mining Pool",
      description: "Choose a pool that supports custom block templates.",
      options: [
        {
          id: 'pool_blitzpool_regtest',
          label: "Blitzpool Regtest",
          subLabel: "Public regtest, no fees, fully SV2 compatible",
          value: "blitzpool_regtest",
          nextStepId: "jd_client_configuration",
          icon: Zap,
          iconUrl: getPoolConfig("blitzpool_regtest")?.iconUrl,
          badge: "Regtest",
          badgeColor: "orange"
        }
      ]
    },
    select_pool_all_mainnet: {
      id: 'select_pool_all_mainnet',
      type: 'question',
      title: "Select Mining Pool",
      description: "Choose the Stratum V2 pool you want to connect to.",
      options: [
        {
          id: 'pool_sri',
          label: "Community SRI Pool",
          subLabel: "Community Hosted Stratum V2 Reference Implementation",
          value: "community_sri",
          nextStepId: "translator_proxy_configuration",
          icon: Globe,
          iconUrl: getPoolConfig("community_sri")?.iconUrl,
          badge: "Testing",
          badgeColor: "blue",
          warning: "Not for production use \u2013 any blocks found will be donated to the SRI project."
        },
        {
          id: 'pool_braiins',
          label: "Braiins Pool",
          subLabel: "Leading Mining Pool",
          value: "braiins",
          nextStepId: "translator_proxy_configuration",
          icon: Cloud,
          iconUrl: getPoolConfig("braiins")?.iconUrl
        },
        {
          id: 'pool_blitzpool',
          label: "Blitzpool",
          subLabel: "Public, no fees, fully SV2 compatible",
          value: "blitzpool",
          nextStepId: "translator_proxy_configuration",
          icon: Zap,
          iconUrl: getPoolConfig("blitzpool")?.iconUrl
        },
        {
          id: 'pool_demand',
          label: "DMND",
          value: "demand",
          nextStepId: "translator_proxy_configuration",
          icon: Zap,
          iconUrl: getPoolConfig("demand")?.iconUrl,
          warning: "Pool for registered businesses only at the moment",
          disabled: true,
          url: "https://dmnd.work/"
        }
      ]
    },
    select_pool_all_testnet4: {
      id: 'select_pool_all_testnet4',
      type: 'question',
      title: "Select Mining Pool",
      description: "Choose the Stratum V2 pool you want to connect to.",
      options: [
        {
          id: 'pool_sri',
          label: "Community SRI Pool",
          subLabel: "Community Hosted Stratum V2 Reference Implementation",
          value: "community_sri",
          nextStepId: "translator_proxy_configuration",
          icon: Globe,
          iconUrl: getPoolConfig("community_sri")?.iconUrl,
          badge: "Testing",
          badgeColor: "blue",
          warning: "Not for production use \u2013 any blocks found will be donated to the SRI project"
        }
      ]
    },
    select_pool_all_regtest: {
      id: 'select_pool_all_regtest',
      type: 'question',
      title: "Select Mining Pool",
      description: "Choose the Stratum V2 pool you want to connect to.",
      options: [
        {
          id: 'pool_blitzpool_regtest',
          label: "Blitzpool Regtest",
          subLabel: "Public regtest, no fees, fully SV2 compatible",
          value: "blitzpool_regtest",
          nextStepId: "translator_proxy_configuration",
          icon: Zap,
          iconUrl: getPoolConfig("blitzpool_regtest")?.iconUrl,
          badge: "Regtest",
          badgeColor: "orange"
        }
      ]
    },
    jd_client_configuration: {
      id: 'jd_client_configuration',
      type: 'custom',
      title: "JD Client Configuration",
      description: "Configure your Job Declarator Client settings.",
      component: <ClientConfigForm />,
      nextStepId: 'translator_proxy_configuration'
    },
    translator_proxy_configuration: {
      id: 'translator_proxy_configuration',
      type: 'custom',
      title: "Translator Proxy Configuration",
      description: "Configure the translator proxy settings.",
      component: <TranslatorProxyConfigForm />,
      nextStepId: 'deployment_pool',
      skipStepId: 'deployment_pool',
      skipLabel: 'Skip — only needed for SV1 miners'
    },
    deployment_pool: {
      id: 'deployment_pool',
      type: 'question',
      title: "Choose Deployment Method",
      description: "How would you like to deploy the Proxy components?",
      options: [
        { id: 'deploy_docker', label: "Docker", subLabel: "Recommended for ease of use", value: "docker", nextStepId: "result_pool_docker", icon: Box },
        { id: 'deploy_bin', label: "Binaries", subLabel: "Manual setup for advanced users", value: "binaries", nextStepId: "result_pool_binaries", icon: Terminal }
      ]
    },
    result_pool_docker: { id: 'result_pool_docker', type: 'result', title: "Proxy via Docker", component: <DeploymentResultContent type="pool-connection" method="docker" /> },
    result_pool_binaries: { id: 'result_pool_binaries', type: 'result', title: "Proxy via Binaries", component: <DeploymentResultContent type="pool-connection" method="binaries" /> },
  }
};
