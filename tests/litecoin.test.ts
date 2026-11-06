import { strict as assert } from "node:assert";
import * as bitcoin from "bitcoinjs-lib";
import { after, before, test } from "node:test";

process.env.DISCORD_TOKEN ||= "test-discord-token";
process.env.DISCORD_CLIENT_ID ||= "test-discord-client";
process.env.ENCRYPTION_SECRET ||= "11".repeat(32);
process.env.LITECOIN_API_TOKEN ||= "test-provider-token";

const { broadcastLitecoinWithdrawal, deriveLitecoinWallet, isLitecoinAddress, litecoinNetwork, prepareLitecoinWithdrawal } =
  await import("../src/blockchain/litecoin.js");

const from = deriveLitecoinWallet(Buffer.alloc(32, 1), false);
const destination = deriveLitecoinWallet(Buffer.alloc(32, 2), false);
const attacker = deriveLitecoinWallet(Buffer.alloc(32, 3), false);
const originalFetch = globalThis.fetch;
let responseMode: "valid" | "unapproved-output" | "wrong-hash" = "valid";
let expectedBroadcastHash = "";

before(() => {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/txs/new")) {
      const outputs = [{ addresses: [destination.address], value: 10_000 }];
      if (responseMode === "unapproved-output") outputs.push({ addresses: [attacker.address], value: 100 });
      const tx = new bitcoin.Transaction();
      tx.version = 1;
      tx.locktime = 0;
      tx.addInput(Buffer.from("22".repeat(32), "hex").reverse(), 0, 0xffffffff);
      for (const output of outputs) {
        tx.addOutput(bitcoin.address.toOutputScript(output.addresses[0], litecoinNetwork(false)), BigInt(output.value));
      }
      const tosign = Buffer.from(tx.hashForSignature(0, bitcoin.address.toOutputScript(from.address, litecoinNetwork(false)), bitcoin.Transaction.SIGHASH_ALL)).toString("hex");
      return Response.json({
        tosign: [responseMode === "wrong-hash" ? "11".repeat(32) : tosign],
        tx: {
          ver: 1,
          lock_time: 0,
          fees: responseMode === "unapproved-output" ? 900 : 1_000,
          inputs: [{ prev_hash: "22".repeat(32), output_index: 0, sequence: 0xffffffff, addresses: [from.address], output_value: 11_000 }],
          outputs,
        },
      });
    }
    assert.ok(url.includes("/txs/send"));
    assert.equal(init?.method, "POST");
    return Response.json({ tx: { hash: expectedBroadcastHash } });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("derives distinct valid Litecoin mainnet and testnet addresses", () => {
  const mainnet = deriveLitecoinWallet(Buffer.alloc(32, 7), false);
  const testnet = deriveLitecoinWallet(Buffer.alloc(32, 7), true);
  assert.equal(mainnet.privateKey.length, 64);
  assert.equal(testnet.privateKey.length, 64);
  assert.ok(isLitecoinAddress(mainnet.address, false));
  assert.ok(isLitecoinAddress(testnet.address, true));
  assert.equal(isLitecoinAddress(mainnet.address, true), false);
  assert.equal(isLitecoinAddress(testnet.address, false), false);
  assert.notEqual(mainnet.address, testnet.address);
});

test("signs and broadcasts only a provider skeleton matching the requested payout", async () => {
  responseMode = "valid";
  const prepared = await prepareLitecoinWithdrawal(
    [{ address: from.address, privateKeyHex: from.privateKey }],
    destination.address,
    10_000n,
    false,
  );
  assert.equal(prepared.feeSatoshis, 1_000n);
  assert.equal(prepared.skeleton.signatures?.length, 1);
  expectedBroadcastHash = prepared.expectedTxHash;
  assert.equal(await broadcastLitecoinWithdrawal(prepared.skeleton, prepared.expectedTxHash, false), prepared.expectedTxHash);
  await assert.rejects(
    broadcastLitecoinWithdrawal(prepared.skeleton, "00".repeat(32), false),
    /does not match the locally signed transaction/,
  );
});

test("rejects provider skeletons with an unauthorized output or forged signing hash", async () => {
  const signers = [{ address: from.address, privateKeyHex: from.privateKey }];
  responseMode = "unapproved-output";
  await assert.rejects(
    prepareLitecoinWithdrawal(signers, destination.address, 10_000n, false),
    /unapproved transaction output/,
  );
  responseMode = "wrong-hash";
  await assert.rejects(
    prepareLitecoinWithdrawal(signers, destination.address, 10_000n, false),
    /signing hash does not match/,
  );
});
