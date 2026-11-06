import { ethers } from "ethers";
import { getTokensForChain, KNOWN_TOKENS } from "./tokens.js";
import { getEvmProvider } from "./provider.js";

const erc20 = new ethers.Interface([
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

export async function getBalance(chainId: string, address: string, isTestnet: boolean): Promise<string> {
  return (await getEvmProvider(chainId, isTestnet).getBalance(address)).toString();
}

export async function getTokenBalances(chainId: string, address: string, isTestnet: boolean): Promise<Array<{ contractAddress: string; balance: string }>> {
  const provider = getEvmProvider(chainId, isTestnet);
  const contracts = [...new Map(getTokensForChain(chainId).map((token) => [token.contractAddress.toLowerCase(), token.contractAddress])).values()];
  const balances = await Promise.all(contracts.map(async (contractAddress) => {
    try {
      const data = erc20.encodeFunctionData("balanceOf", [address]);
      const result = await provider.call({ to: contractAddress, data });
      const [balance] = erc20.decodeFunctionResult("balanceOf", result);
      return BigInt(balance) > 0n ? { contractAddress, balance: BigInt(balance).toString() } : null;
    } catch {
      return null;
    }
  }));
  return balances.filter((item): item is { contractAddress: string; balance: string } => item !== null);
}

export async function getTokenMetadata(chainId: string, contractAddress: string, isTestnet: boolean): Promise<{ symbol?: string; decimals?: number }> {
  const known = KNOWN_TOKENS.find((token) => token.chainId === chainId && token.contractAddress.toLowerCase() === contractAddress.toLowerCase());
  if (known) return { symbol: known.symbol, decimals: known.decimals };
  const provider = getEvmProvider(chainId, isTestnet);
  const [symbolData, decimalsData] = await Promise.all([
    provider.call({ to: contractAddress, data: erc20.encodeFunctionData("symbol") }),
    provider.call({ to: contractAddress, data: erc20.encodeFunctionData("decimals") }),
  ]);
  const [symbol] = erc20.decodeFunctionResult("symbol", symbolData);
  const [decimals] = erc20.decodeFunctionResult("decimals", decimalsData);
  return { symbol: String(symbol), decimals: Number(decimals) };
}

