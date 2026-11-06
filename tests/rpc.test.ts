import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { getRpcUrl } from "../src/blockchain/provider.js";

const keys = ["ETHEREUM_RPC_URL", "ETHEREUM_TESTNET_RPC_URL", "SOLANA_RPC_URL"] as const;
const previous = new Map<string, string | undefined>();
for (const key of keys) previous.set(key, process.env[key]);

afterEach(() => {
  for (const key of keys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("uses public no-login RPC defaults for EVM and Solana", () => {
  delete process.env.ETHEREUM_RPC_URL;
  delete process.env.ETHEREUM_TESTNET_RPC_URL;
  delete process.env.SOLANA_RPC_URL;
  assert.equal(getRpcUrl("ethereum", false), "https://ethereum-rpc.publicnode.com/");
  assert.equal(getRpcUrl("ethereum", true), "https://ethereum-sepolia-rpc.publicnode.com/");
  assert.equal(getRpcUrl("solana", false), "https://api.mainnet-beta.solana.com/");
});

test("allows secure per-chain provider overrides", () => {
  process.env.ETHEREUM_RPC_URL = "https://rpc.example.org/v1/key";
  assert.equal(getRpcUrl("ethereum", false), "https://rpc.example.org/v1/key");
});

test("rejects insecure or credential-bearing remote RPC URLs", () => {
  process.env.ETHEREUM_RPC_URL = "http://rpc.example.org";
  assert.throws(() => getRpcUrl("ethereum", false), /must use HTTPS/);
  process.env.ETHEREUM_RPC_URL = "https://user:pass@rpc.example.org";
  assert.throws(() => getRpcUrl("ethereum", false), /must not include URL credentials/);
});
