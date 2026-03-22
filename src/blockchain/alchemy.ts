import { Alchemy, Network } from "alchemy-sdk";
import { config } from "../config.js";
import { CHAINS, getNetworkConfig } from "./chains.js";

const clients = new Map<string, Alchemy>();

function clientKey(chainId: string, isTestnet: boolean): string {
  return `${chainId}:${isTestnet ? "testnet" : "mainnet"}`;
}

export function getAlchemy(chainId: string, isTestnet: boolean): Alchemy {
  const key = clientKey(chainId, isTestnet);
  let client = clients.get(key);
  if (!client) {
    const net = getNetworkConfig(chainId, isTestnet);
    client = new Alchemy({
      apiKey: config.alchemy.apiKey,
      network: net.network,
    });
    clients.set(key, client);
  }
  return client;
}

export async function getBalance(
  chainId: string,
  address: string,
  isTestnet: boolean,
): Promise<string> {
  const alchemy = getAlchemy(chainId, isTestnet);
  const balance = await alchemy.core.getBalance(address);
  return balance.toString();
}

export async function getTokenBalances(
  chainId: string,
  address: string,
  isTestnet: boolean,
) {
  const alchemy = getAlchemy(chainId, isTestnet);
  const result = await alchemy.core.getTokenBalances(address);
  return result.tokenBalances
    .filter((t) => t.tokenBalance && BigInt(t.tokenBalance) > 0n)
    .map((t) => ({
      contractAddress: t.contractAddress,
      balance: t.tokenBalance!,
    }));
}

export async function getTokenMetadata(
  chainId: string,
  contractAddress: string,
  isTestnet: boolean,
) {
  const alchemy = getAlchemy(chainId, isTestnet);
  return alchemy.core.getTokenMetadata(contractAddress);
}

export async function getAssetTransfers(
  chainId: string,
  address: string,
  isTestnet: boolean,
  direction: "from" | "to",
) {
  const alchemy = getAlchemy(chainId, isTestnet);
  const params: Record<string, unknown> = {
    category: ["external", "erc20"],
    order: "desc",
    maxCount: 20,
  };
  if (direction === "from") params.fromAddress = address;
  else params.toAddress = address;

  return alchemy.core.getAssetTransfers(params as never);
}

export function getAllAlchemyNetworks(): { chainId: string; network: Network; isTestnet: boolean }[] {
  const networks: { chainId: string; network: Network; isTestnet: boolean }[] = [];
  for (const [chainId, chain] of Object.entries(CHAINS)) {
    networks.push({ chainId, network: chain.mainnet.network, isTestnet: false });
    networks.push({ chainId, network: chain.testnet.network, isTestnet: true });
  }
  return networks;
}
