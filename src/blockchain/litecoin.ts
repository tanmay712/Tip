import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { BIP32Factory } from "bip32";
import { ECPairFactory } from "ecpair";
import { config } from "../config.js";

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

const LTC_MAINNET: bitcoin.Network = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};
const LTC_TESTNET: bitcoin.Network = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "tltc",
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x6f,
  scriptHash: 0x3a,
  wif: 0xef,
};
const API_ROOT = config.litecoin.apiBaseUrl;
let lastRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();
const balanceCache = new Map<string, { balance: string; expiresAt: number }>();

export interface LitecoinTxOutput {
  addresses?: string[];
  value?: number;
}
export interface LitecoinTransaction {
  hash: string;
  confirmations?: number;
  outputs?: LitecoinTxOutput[];
}
interface LitecoinApiError {
  error?: string;
}

export function isLitecoinConfigured(): boolean {
  return Boolean(config.litecoin.blockCypherToken);
}

export function litecoinNetwork(isTestnet: boolean): bitcoin.Network {
  return isTestnet ? LTC_TESTNET : LTC_MAINNET;
}

export function deriveLitecoinWallet(seed: Buffer, isTestnet: boolean): { address: string; privateKey: string } {
  const network = litecoinNetwork(isTestnet);
  const child = bip32.fromSeed(seed, network).derivePath("m/44'/2'/0'/0/0");
  if (!child.privateKey) throw new Error("Litecoin HD derivation returned no private key");
  const payment = bitcoin.payments.p2pkh({ pubkey: child.publicKey, network });
  if (!payment.address) throw new Error("Could not derive Litecoin address");
  return { address: payment.address, privateKey: Buffer.from(child.privateKey).toString("hex") };
}

export function isLitecoinAddress(address: string, isTestnet: boolean): boolean {
  try {
    bitcoin.address.toOutputScript(address, litecoinNetwork(isTestnet));
    return true;
  } catch {
    return false;
  }
}

function apiBase(isTestnet: boolean): string {
  if (!config.litecoin.blockCypherToken) {
    throw new Error("Litecoin provider is not configured; set LITECOIN_API_TOKEN before enabling LTC deposits or withdrawals");
  }
  return `${API_ROOT}/${isTestnet ? "test3" : "main"}`;
}

async function waitForRequestSlot(): Promise<void> {
  let release!: () => void;
  const previous = requestQueue;
  requestQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const waitMs = Math.max(0, 400 - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
  release();
}

async function request<T>(path: string, isTestnet: boolean, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  await waitForRequestSlot();
  const url = new URL(`${apiBase(isTestnet)}${path}`);
  url.searchParams.set("token", config.litecoin.blockCypherToken);
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json() as T & LitecoinApiError;
  if (!response.ok) throw new Error(`Litecoin provider request failed (${response.status}): ${result.error ?? "unknown provider error"}`);
  return result;
}

export async function getLitecoinBalance(address: string, isTestnet: boolean): Promise<string> {
  const key = `${isTestnet ? "testnet" : "mainnet"}:${address}`;
  const cached = balanceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.balance;
  const result = await request<{ final_balance: number }>(`/addrs/${encodeURIComponent(address)}/balance`, isTestnet);
  if (!Number.isSafeInteger(result.final_balance) || result.final_balance < 0) throw new Error("Litecoin provider returned an invalid balance");
  const balance = String(result.final_balance);
  balanceCache.set(key, { balance, expiresAt: Date.now() + 15_000 });
  return balance;
}

export async function getLitecoinReserve(addresses: string[], isTestnet: boolean): Promise<bigint> {
  const uniqueAddresses = [...new Set(addresses)];
  let reserve = 0n;
  for (const address of uniqueAddresses) reserve += BigInt(await getLitecoinBalance(address, isTestnet));
  return reserve;
}

export async function getLitecoinTransactions(address: string, isTestnet: boolean): Promise<LitecoinTransaction[]> {
  const result = await request<{ txs?: LitecoinTransaction[] }>(`/addrs/${encodeURIComponent(address)}/full?limit=50`, isTestnet);
  return result.txs ?? [];
}

export async function getLitecoinTransaction(hash: string, isTestnet: boolean): Promise<LitecoinTransaction> {
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error("Invalid Litecoin transaction hash");
  return request<LitecoinTransaction>(`/txs/${hash}`, isTestnet);
}

interface TxSkeleton {
  tosign: string[];
  signatures?: string[];
  pubkeys?: string[];
  errors?: Array<{ error?: string }>;
  tx?: {
    hash?: string;
    fees?: number;
    ver?: number;
    lock_time?: number;
    inputs?: Array<{ prev_hash?: string; output_index?: number; sequence?: number; addresses?: string[]; output_value?: number }>;
    outputs?: Array<{ addresses?: string[]; value?: number }>;
  };
  [key: string]: unknown;
}

/** Prepare a signed transaction, but do not broadcast until the caller checks the fee and balance. */
export async function prepareLitecoinWithdrawal(
  signers: Array<{ address: string; privateKeyHex: string }>,
  destination: string,
  amountSatoshis: bigint,
  isTestnet: boolean,
): Promise<{ skeleton: TxSkeleton; feeSatoshis: bigint; expectedTxHash: string }> {
  if (amountSatoshis <= 0n || amountSatoshis > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Litecoin amount is outside provider limits");
  if (!isLitecoinAddress(destination, isTestnet) || signers.length === 0) throw new Error("Invalid Litecoin withdrawal inputs");
  for (const signer of signers) if (!isLitecoinAddress(signer.address, isTestnet)) throw new Error("Invalid Litecoin signer address");
  const signerByAddress = new Map(signers.map((signer) => [signer.address, signer.privateKeyHex]));
  const skeleton = await request<TxSkeleton>("/txs/new", isTestnet, "POST", {
    inputs: signers.map(({ address }) => ({ addresses: [address] })),
    outputs: [{ addresses: [destination], value: Number(amountSatoshis) }],
  });
  if (skeleton.errors?.length) throw new Error(skeleton.errors.map((item) => item.error ?? "transaction construction failed").join("; "));
  if (!Array.isArray(skeleton.tosign) || skeleton.tosign.length === 0) throw new Error("Litecoin provider returned an unsigned transaction without signing hashes");
  const inputs = skeleton.tx?.inputs;
  const outputs = skeleton.tx?.outputs;
  if (!inputs || inputs.length !== skeleton.tosign.length || !outputs?.length) {
    throw new Error("Litecoin provider returned an incomplete transaction skeleton");
  }
  const network = litecoinNetwork(isTestnet);
  const version = skeleton.tx?.ver ?? 1;
  const lockTime = skeleton.tx?.lock_time ?? 0;
  if (!Number.isSafeInteger(version) || !Number.isSafeInteger(lockTime) || lockTime < 0 || lockTime > 0xffffffff) {
    throw new Error("Litecoin provider returned invalid transaction metadata");
  }
  const unsignedTx = new bitcoin.Transaction();
  unsignedTx.version = version;
  unsignedTx.locktime = lockTime;
  for (const input of inputs) {
    if (!input.addresses || input.addresses.length !== 1 || !signerByAddress.has(input.addresses[0])) {
      throw new Error("Litecoin provider selected an input outside the configured signing wallets");
    }
    if (!/^[0-9a-f]{64}$/i.test(input.prev_hash ?? "") || !Number.isSafeInteger(input.output_index) || input.output_index! < 0) {
      throw new Error("Litecoin provider returned an invalid transaction input reference");
    }
    const sequence = input.sequence ?? 0xffffffff;
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0xffffffff) {
      throw new Error("Litecoin provider returned an invalid input sequence");
    }
    unsignedTx.addInput(Buffer.from(input.prev_hash!, "hex").reverse(), input.output_index!, sequence);
  }
  let destinationTotal = 0n;
  let inputTotal = 0n;
  let outputTotal = 0n;
  for (const input of inputs) {
    if (typeof input.output_value !== "number" || !Number.isSafeInteger(input.output_value) || input.output_value <= 0) {
      throw new Error("Litecoin provider returned an invalid transaction input value");
    }
    inputTotal += BigInt(input.output_value);
  }
  for (const output of outputs) {
    if (typeof output.value !== "number" || !Number.isSafeInteger(output.value) || output.value < 0) {
      throw new Error("Litecoin provider returned an invalid transaction output");
    }
    if (!output.addresses || output.addresses.length !== 1) throw new Error("Litecoin provider returned an unsupported output script");
    const outputAddress = output.addresses[0];
    unsignedTx.addOutput(bitcoin.address.toOutputScript(outputAddress, network), BigInt(output.value));
    outputTotal += BigInt(output.value);
    if (outputAddress === destination) {
      destinationTotal += BigInt(output.value);
    } else if (!output.addresses?.length || output.addresses.some((address) => !signerByAddress.has(address))) {
      throw new Error("Litecoin provider added an unapproved transaction output");
    }
  }
  if (destinationTotal !== amountSatoshis) throw new Error("Litecoin provider transaction does not match the requested destination and amount");
  const fee = skeleton.tx?.fees;
  if (typeof fee !== "number" || !Number.isSafeInteger(fee) || fee < 0) throw new Error("Litecoin provider did not return a valid miner fee");
  if (inputTotal - outputTotal !== BigInt(fee)) throw new Error("Litecoin provider fee does not match transaction inputs and outputs");
  for (let index = 0; index < skeleton.tosign.length; index++) {
    const sourceAddress = inputs[index].addresses![0];
    const previousOutputScript = bitcoin.address.toOutputScript(sourceAddress, network);
    const locallyComputedHash = Buffer.from(unsignedTx.hashForSignature(index, previousOutputScript, bitcoin.Transaction.SIGHASH_ALL)).toString("hex");
    if (locallyComputedHash.toLowerCase() !== skeleton.tosign[index].toLowerCase()) {
      throw new Error("Litecoin provider signing hash does not match the locally verified transaction");
    }
  }
  skeleton.pubkeys = [];
  skeleton.signatures = [];
  for (let index = 0; index < skeleton.tosign.length; index++) {
    const signHash = skeleton.tosign[index];
    if (!/^[0-9a-f]{64}$/i.test(signHash)) throw new Error("Litecoin provider returned an invalid signing hash");
    const inputAddresses = skeleton.tx?.inputs?.[index]?.addresses ?? [];
    const privateKeyHex = inputAddresses.map((address) => signerByAddress.get(address)).find(Boolean);
    if (!privateKeyHex) throw new Error("Litecoin provider selected an input outside the configured signing wallets");
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKeyHex, "hex"), { network: litecoinNetwork(isTestnet) });
    const compactSignature = keyPair.sign(Buffer.from(signHash, "hex"));
    const derWithHashType = bitcoin.script.signature.encode(compactSignature, bitcoin.Transaction.SIGHASH_ALL);
    const publicKey = Buffer.from(keyPair.publicKey);
    skeleton.pubkeys.push(publicKey.toString("hex"));
    // BlockCypher asks for DER signatures without the trailing sighash byte.
    skeleton.signatures.push(Buffer.from(derWithHashType).subarray(0, -1).toString("hex"));
    unsignedTx.setInputScript(index, bitcoin.script.compile([Buffer.from(derWithHashType), publicKey]));
  }
  return { skeleton, feeSatoshis: BigInt(fee), expectedTxHash: unsignedTx.getId() };
}

export async function broadcastLitecoinWithdrawal(skeleton: TxSkeleton, expectedTxHash: string, isTestnet: boolean): Promise<string> {
  const response = await request<{ tx?: { hash?: string }; errors?: Array<{ error?: string }> }>("/txs/send", isTestnet, "POST", skeleton);
  if (response.errors?.length) throw new Error(response.errors.map((item) => item.error ?? "broadcast failed").join("; "));
  const hash = response.tx?.hash;
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) throw new Error("Litecoin provider did not return a transaction hash");
  if (hash.toLowerCase() !== expectedTxHash.toLowerCase()) throw new Error("Litecoin provider broadcast hash does not match the locally signed transaction");
  return hash;
}
