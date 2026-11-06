import { ethers } from "ethers";
import { getChain, getNetworkConfig } from "./chains.js";

const providers = new Map<string, ethers.JsonRpcProvider>();
const EVM_CHAIN_IDS: Record<string, { mainnet: number; testnet: number }> = {
  ethereum: { mainnet: 1, testnet: 11155111 },
  polygon: { mainnet: 137, testnet: 80002 },
  arbitrum: { mainnet: 42161, testnet: 421614 },
  optimism: { mainnet: 10, testnet: 11155420 },
  base: { mainnet: 8453, testnet: 84532 },
  zksync: { mainnet: 324, testnet: 300 },
  avalanche: { mainnet: 43114, testnet: 43113 },
};

export function getRpcUrl(chainId: string, isTestnet: boolean): string {
  const chain = getChain(chainId);
  if (chain.type === "litecoin") throw new Error("Litecoin uses its hosted UTXO provider, not EVM JSON-RPC");
  const net = getNetworkConfig(chainId, isTestnet);
  const envKey = `${chainId.toUpperCase()}_${isTestnet ? "TESTNET_" : ""}RPC_URL`;
  const url = process.env[envKey] || net.rpcUrl;
  if (!url) throw new Error(`No public RPC endpoint configured for ${chainId}`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${envKey} must be a valid URL`);
  }
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) throw new Error(`${envKey} must use HTTPS`);
  if (parsed.username || parsed.password) throw new Error(`${envKey} must not include URL credentials`);
  return parsed.toString();
}

export function getEvmProvider(chainId: string, isTestnet: boolean): ethers.JsonRpcProvider {
  const key = `${chainId}:${isTestnet ? "testnet" : "mainnet"}`;
  let provider = providers.get(key);
  if (!provider) {
    const url = getRpcUrl(chainId, isTestnet);
    const expectedChainId = EVM_CHAIN_IDS[chainId]?.[isTestnet ? "testnet" : "mainnet"];
    if (!expectedChainId) throw new Error(`No EVM chain ID configured for ${chainId}`);
    provider = new ethers.JsonRpcProvider(url, expectedChainId);
    providers.set(key, provider);
  }
  return provider;
}

export async function estimateGas(chainId: string, isTestnet: boolean, tx: ethers.TransactionRequest): Promise<bigint> {
  return getEvmProvider(chainId, isTestnet).estimateGas(tx);
}

export async function getGasPrice(chainId: string, isTestnet: boolean): Promise<bigint> {
  const feeData = await getEvmProvider(chainId, isTestnet).getFeeData();
  return feeData.gasPrice ?? 0n;
}

export async function broadcastEvmTransaction(chainId: string, isTestnet: boolean, signedTx: string): Promise<ethers.TransactionResponse> {
  return getEvmProvider(chainId, isTestnet).broadcastTransaction(signedTx);
}

export async function waitForTransaction(chainId: string, isTestnet: boolean, txHash: string, confirmations = 1): Promise<ethers.TransactionReceipt | null> {
  return getEvmProvider(chainId, isTestnet).waitForTransaction(txHash, confirmations, 120_000);
}
