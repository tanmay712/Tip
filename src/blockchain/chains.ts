export type ChainType = "evm" | "solana" | "litecoin";

export interface ChainConfig {
  id: string;
  name: string;
  type: ChainType;
  nativeToken: string;
  nativeDecimals: number;
  mainnet: { rpcUrl?: string; explorer: string };
  testnet: { rpcUrl?: string; explorer: string };
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
      rpcUrl: "https://ethereum-rpc.publicnode.com",
      explorer: "https://etherscan.io",
    },
    testnet: {
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
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
      rpcUrl: "https://polygon-bor-rpc.publicnode.com",
      explorer: "https://polygonscan.com",
    },
    testnet: {
      rpcUrl: "https://polygon-amoy-bor-rpc.publicnode.com",
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
      rpcUrl: "https://arbitrum-one-rpc.publicnode.com",
      explorer: "https://arbiscan.io",
    },
    testnet: {
      rpcUrl: "https://arbitrum-sepolia-rpc.publicnode.com",
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
      rpcUrl: "https://optimism-rpc.publicnode.com",
      explorer: "https://optimistic.etherscan.io",
    },
    testnet: {
      rpcUrl: "https://optimism-sepolia-rpc.publicnode.com",
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
      rpcUrl: "https://base-rpc.publicnode.com",
      explorer: "https://basescan.org",
    },
    testnet: {
      rpcUrl: "https://base-sepolia-rpc.publicnode.com",
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
      rpcUrl: "https://mainnet.era.zksync.io",
      explorer: "https://explorer.zksync.io",
    },
    testnet: {
      rpcUrl: "https://sepolia.era.zksync.dev",
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
      rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
      explorer: "https://snowtrace.io",
    },
    testnet: {
      rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
      explorer: "https://testnet.snowtrace.io",
    },
    color: 0xe84142,
    emoji: "🔺",
    derivationPath: "m/44'/60'/0'/0/0",
  },
  litecoin: {
    id: "litecoin",
    name: "Litecoin",
    type: "litecoin",
    nativeToken: "LTC",
    nativeDecimals: 8,
    mainnet: {
      explorer: "https://live.blockcypher.com/ltc",
    },
    testnet: {
      explorer: "https://live.blockcypher.com/ltc-test",
    },
    color: 0x345d9d,
    emoji: "Ł",
    derivationPath: "m/44'/2'/0'/0/0",
  },
  solana: {
    id: "solana",
    name: "Solana",
    type: "solana",
    nativeToken: "SOL",
    nativeDecimals: 9,
    mainnet: {
      rpcUrl: "https://api.mainnet-beta.solana.com",
      explorer: "https://solscan.io",
    },
    testnet: {
      rpcUrl: "https://api.devnet.solana.com",
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
