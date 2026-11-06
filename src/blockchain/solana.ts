import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import { getRpcUrl } from "./provider.js";

const connections = new Map<string, Connection>();

function getSolanaRpcUrl(isTestnet: boolean): string {
  return getRpcUrl("solana", isTestnet);
}

export function getSolanaConnection(isTestnet: boolean): Connection {
  const key = isTestnet ? "devnet" : "mainnet";
  let conn = connections.get(key);
  if (!conn) {
    conn = new Connection(getSolanaRpcUrl(isTestnet), "confirmed");
    connections.set(key, conn);
  }
  return conn;
}

export function solanaKeypairFromSeed(seed: Buffer): Keypair {
  return Keypair.fromSeed(seed.subarray(0, 32));
}

export async function getSolBalance(
  address: string,
  isTestnet: boolean,
): Promise<string> {
  const conn = getSolanaConnection(isTestnet);
  const balance = await conn.getBalance(new PublicKey(address));
  return balance.toString();
}

export async function getSplTokenBalance(
  walletAddress: string,
  mintAddress: string,
  isTestnet: boolean,
): Promise<string> {
  const conn = getSolanaConnection(isTestnet);
  try {
    const ata = await getAssociatedTokenAddress(
      new PublicKey(mintAddress),
      new PublicKey(walletAddress),
    );
    const account = await getAccount(conn, ata);
    return account.amount.toString();
  } catch {
    return "0";
  }
}

export async function transferSol(
  from: Keypair,
  toAddress: string,
  lamports: bigint,
  isTestnet: boolean,
): Promise<string> {
  const conn = getSolanaConnection(isTestnet);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: new PublicKey(toAddress),
      lamports: Number(lamports),
    }),
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [from]);
  return sig;
}

export async function transferSplToken(
  from: Keypair,
  toAddress: string,
  mintAddress: string,
  amount: bigint,
  isTestnet: boolean,
): Promise<string> {
  const conn = getSolanaConnection(isTestnet);
  const mint = new PublicKey(mintAddress);
  const fromAta = await getAssociatedTokenAddress(mint, from.publicKey);
  const toAta = await getAssociatedTokenAddress(mint, new PublicKey(toAddress));

  const tx = new Transaction().add(
    createTransferInstruction(fromAta, toAta, from.publicKey, Number(amount)),
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [from]);
  return sig;
}
