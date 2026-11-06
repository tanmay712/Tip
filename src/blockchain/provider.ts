import { ethers } from "ethers";
import { config } from "../config.js";
import { getNetworkConfig } from "./chains.js";

const providers = new Map<string, ethers.JsonRpcProvider>();

export function getEvmProvider(
  chainId: string,
  isTestnet: boolean,
): ethers.JsonRpcProvider {
  const key = `${chainId}:${isTestnet}`;
  let provider = providers.get(key);
  if (!provider) {
    const net = getNetworkConfig(chainId, isTestnet);
    if (!net.rpcSuffix) throw new Error(`${chainId} does not use an Alchemy EVM RPC provider`);
    const url = `https://${net.rpcSuffix}.g.alchemy.com/v2/${config.alchemy.apiKey}`;
    provider = new ethers.JsonRpcProvider(url);
    providers.set(key, provider);
  }
  return provider;
}

export async function estimateGas(
  chainId: string,
  isTestnet: boolean,
  tx: ethers.TransactionRequest,
): Promise<bigint> {
  const provider = getEvmProvider(chainId, isTestnet);
  return provider.estimateGas(tx);
}

export async function getGasPrice(
  chainId: string,
  isTestnet: boolean,
): Promise<bigint> {
  const provider = getEvmProvider(chainId, isTestnet);
  const feeData = await provider.getFeeData();
  return feeData.gasPrice ?? 0n;
}

export async function broadcastEvmTransaction(
  chainId: string,
  isTestnet: boolean,
  signedTx: string,
): Promise<ethers.TransactionResponse> {
  const provider = getEvmProvider(chainId, isTestnet);
  return provider.broadcastTransaction(signedTx);
}

export async function waitForTransaction(
  chainId: string,
  isTestnet: boolean,
  txHash: string,
  confirmations = 1,
): Promise<ethers.TransactionReceipt | null> {
  const provider = getEvmProvider(chainId, isTestnet);
  return provider.waitForTransaction(txHash, confirmations, 120_000);
}
