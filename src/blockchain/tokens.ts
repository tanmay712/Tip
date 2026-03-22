export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  contractAddress: string;
  chainId: string;
}

export const KNOWN_TOKENS: TokenInfo[] = [
  // Ethereum mainnet
  { symbol: "USDC", name: "USD Coin", decimals: 6, contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", chainId: "ethereum" },
  { symbol: "USDT", name: "Tether USD", decimals: 6, contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7", chainId: "ethereum" },
  { symbol: "DAI", name: "Dai Stablecoin", decimals: 18, contractAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F", chainId: "ethereum" },
  { symbol: "WETH", name: "Wrapped Ether", decimals: 18, contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", chainId: "ethereum" },
  { symbol: "LINK", name: "Chainlink Token", decimals: 18, contractAddress: "0x514910771AF9Ca656af840dff83E8264EcF986CA", chainId: "ethereum" },

  // Polygon mainnet
  { symbol: "USDC", name: "USD Coin", decimals: 6, contractAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", chainId: "polygon" },
  { symbol: "USDT", name: "Tether USD", decimals: 6, contractAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", chainId: "polygon" },
  { symbol: "WETH", name: "Wrapped Ether", decimals: 18, contractAddress: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", chainId: "polygon" },

  // Arbitrum mainnet
  { symbol: "USDC", name: "USD Coin", decimals: 6, contractAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", chainId: "arbitrum" },
  { symbol: "USDT", name: "Tether USD", decimals: 6, contractAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", chainId: "arbitrum" },
  { symbol: "ARB", name: "Arbitrum", decimals: 18, contractAddress: "0x912CE59144191C1204E64559FE8253a0e49E6548", chainId: "arbitrum" },

  // Optimism mainnet
  { symbol: "USDC", name: "USD Coin", decimals: 6, contractAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", chainId: "optimism" },
  { symbol: "OP", name: "Optimism", decimals: 18, contractAddress: "0x4200000000000000000000000000000000000042", chainId: "optimism" },

  // Base mainnet
  { symbol: "USDC", name: "USD Coin", decimals: 6, contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chainId: "base" },

  // Avalanche mainnet
  { symbol: "USDC", name: "USD Coin", decimals: 6, contractAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", chainId: "avalanche" },
  { symbol: "WAVAX", name: "Wrapped AVAX", decimals: 18, contractAddress: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", chainId: "avalanche" },
];

export function findToken(symbol: string, chainId: string): TokenInfo | undefined {
  return KNOWN_TOKENS.find(
    (t) => t.symbol.toLowerCase() === symbol.toLowerCase() && t.chainId === chainId,
  );
}

export function getTokensForChain(chainId: string): TokenInfo[] {
  return KNOWN_TOKENS.filter((t) => t.chainId === chainId);
}
