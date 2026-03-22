import { Network } from "alchemy-sdk";

export type ChainType = "evm" | "solana";

export interface ChainConfig {
  id: string;
  name: string;
  type: ChainType;
  nativeToken: string;
  nativeDecimals: number;
  mainnet: { network: Network; rpcSuffix: string; explorer: string };
  testnet: { network: Network; rpcSuffix: string; explorer: string };
  color: number;
  emoji: string;
  derivationPath: string;
}

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    type: "evm",
    nativeToken: "ETH",
    nativeDecimals: 18,
    mainnet: {
      network: Network.ETH_MAINNET,
      rpcSuffix: "eth-mainnet",
      explorer: "https://etherscan.io",
    },
    testnet: {
      network: Network.ETH_SEPOLIA,
      rpcSuffix: "eth-sepolia",
      explorer: "https://sepolia.etherscan.io",
    },
    color: 0x627eea,
    emoji: "⟠",
    derivationPath: "m/44'/60'/0'/0/0",
  },
  polygon: {
    id: "polygon",
    name: "Polygon",
    type: "evm",
    nativeToken: "POL",
    nativeDecimals: 18,
    mainnet: {
      network: Network.MATIC_MAINNET,
      rpcSuffix: "polygon-mainnet",
      explorer: "https://polygonscan.com",
    },
    testnet: {
      network: Network.MATIC_AMOY,
      rpcSuffix: "polygon-amoy",
      explorer: "https://amoy.polygonscan.com",
    },
    color: 0x8247e5,
    emoji: "🟣",
    derivationPath: "m/44'/60'/0'/0/0",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum",
    type: "evm",
    nativeToken: "ETH",
    nativeDecimals: 18,
    mainnet: {
      network: Network.ARB_MAINNET,
      rpcSuffix: "arb-mainnet",
      explorer: "https://arbiscan.io",
    },
    testnet: {
      network: Network.ARB_SEPOLIA,
      rpcSuffix: "arb-sepolia",
      explorer: "https://sepolia.arbiscan.io",
    },
    color: 0x28a0f0,
    emoji: "🔵",
    derivationPath: "m/44'/60'/0'/0/0",
  },
  optimism: {
    id: "optimism",
    name: "Optimism",
    type: "evm",
    nativeToken: "ETH",
    nativeDecimals: 18,
    mainnet: {
      network: Network.OPT_MAINNET,
      rpcSuffix: "opt-mainnet",
      explorer: "https://optimistic.etherscan.io",
    },
    testnet: {
      network: Network.OPT_SEPOLIA,
      rpcSuffix: "opt-sepolia",
      explorer: "https://sepolia-optimism.etherscan.io",
    },
    color: 0xff0420,
    emoji: "🔴",
    derivationPath: "m/44'/60'/0'/0/0",
  },
  base: {
    id: "base",
    name: "Base",
    type: "evm",
    nativeToken: "ETH",
    nativeDecimals: 18,
    mainnet: {
      network: Network.BASE_MAINNET,
      rpcSuffix: "base-mainnet",
      explorer: "https://basescan.org",
    },
    testnet: {
      network: Network.BASE_SEPOLIA,
      rpcSuffix: "base-sepolia",
      explorer: "https://sepolia.basescan.org",
    },
    color: 0x0052ff,
    emoji: "🔷",
    derivationPath: "m/44'/60'/0'/0/0",
  },
  zksync: {
    id: "zksync",
    name: "zkSync",
    type: "evm",
    nativeToken: "ETH",
    nativeDecimals: 18,
    mainnet: {
      network: Network.ZKSYNC_MAINNET,
      rpcSuffix: "zksync-mainnet",
      explorer: "https://explorer.zksync.io",
    },
    testnet: {
      network: Network.ZKSYNC_SEPOLIA,
      rpcSuffix: "zksync-sepolia",
      explorer: "https://sepolia.explorer.zksync.io",
    },
    color: 0x8c8dfc,
    emoji: "💠",
    derivationPath: "m/44'/60'/0'/0/0",
  },
  avalanche: {
    id: "avalanche",
    name: "Avalanche",
    type: "evm",
    nativeToken: "AVAX",
    nativeDecimals: 18,
    mainnet: {
      network: Network.AVAX_MAINNET,
      rpcSuffix: "avax-mainnet",
      explorer: "https://snowtrace.io",
    },
    testnet: {
      network: Network.AVAX_FUJI,
      rpcSuffix: "avax-fuji",
      explorer: "https://testnet.snowtrace.io",
    },
    color: 0xe84142,
    emoji: "🔺",
    derivationPath: "m/44'/60'/0'/0/0",
  },
  solana: {
    id: "solana",
    name: "Solana",
    type: "solana",
    nativeToken: "SOL",
    nativeDecimals: 9,
    mainnet: {
      network: Network.SOLANA_MAINNET,
      rpcSuffix: "solana-mainnet",
      explorer: "https://solscan.io",
    },
    testnet: {
      network: Network.SOLANA_DEVNET,
      rpcSuffix: "solana-devnet",
      explorer: "https://solscan.io?cluster=devnet",
    },
    color: 0x9945ff,
    emoji: "◎",
    derivationPath: "m/44'/501'/0'/0'",
  },
};

export const CHAIN_IDS = Object.keys(CHAINS);

export function getChain(id: string): ChainConfig {
  const chain = CHAINS[id];
  if (!chain) throw new Error(`Unknown chain: ${id}`);
  return chain;
}

export function getNetworkConfig(chainId: string, isTestnet: boolean) {
  const chain = getChain(chainId);
  return isTestnet ? chain.testnet : chain.mainnet;
}

export function getExplorerTxUrl(
  chainId: string,
  txHash: string,
  isTestnet: boolean,
): string {
  const net = getNetworkConfig(chainId, isTestnet);
  if (chainId === "solana") {
    return `${net.explorer}/tx/${txHash}`;
  }
  return `${net.explorer}/tx/${txHash}`;
}

export function getExplorerAddressUrl(
  chainId: string,
  address: string,
  isTestnet: boolean,
): string {
  const net = getNetworkConfig(chainId, isTestnet);
  if (chainId === "solana") {
    return `${net.explorer}/account/${address}`;
  }
  return `${net.explorer}/address/${address}`;
}
