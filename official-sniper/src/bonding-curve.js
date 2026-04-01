import { PublicKey } from '@solana/web3.js';

// ── Pump.fun program constants ────────────────────────────────────────────────
export const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Tokens placed into bonding curve at launch (6-decimal fixed)
const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n;

// ── PDA derivation ────────────────────────────────────────────────────────────
/**
 * Derive the bonding-curve PDA for a given mint.
 * Seeds: ["bonding-curve", mint.toBuffer()]
 */
export function getBondingCurvePDA(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()],
    PUMP_PROGRAM_ID
  );
  return pda;
}

// ── Account deserialization ───────────────────────────────────────────────────
/**
 * Parse raw bonding-curve account data.
 *
 * Layout (after 8-byte Anchor discriminator):
 *   offset  8 → virtualTokenReserves (u64 LE)
 *   offset 16 → virtualSolReserves   (u64 LE)
 *   offset 24 → realTokenReserves    (u64 LE)
 *   offset 32 → realSolReserves      (u64 LE)
 *   offset 40 → tokenTotalSupply     (u64 LE)
 *   offset 48 → complete             (bool)
 */
export function parseBondingCurve(data) {
  if (!data || data.length < 49) return null;
  return {
    virtualTokenReserves: data.readBigUInt64LE(8),
    virtualSolReserves:   data.readBigUInt64LE(16),
    realTokenReserves:    data.readBigUInt64LE(24),
    realSolReserves:      data.readBigUInt64LE(32),
    tokenTotalSupply:     data.readBigUInt64LE(40),
    complete:             data[48] === 1,
  };
}

// ── Completion math ───────────────────────────────────────────────────────────
/**
 * Returns bonding curve completion as a percentage (0–100).
 * Uses BigInt arithmetic to avoid floating-point drift near 100%.
 */
export function getCompletionPct(realTokenReserves) {
  if (realTokenReserves <= 0n) return 100;
  const sold = INITIAL_REAL_TOKEN_RESERVES - realTokenReserves;
  if (sold <= 0n) return 0;
  return Number(sold * 10_000n / INITIAL_REAL_TOKEN_RESERVES) / 100;
}

// ── Constant-product buy estimate ─────────────────────────────────────────────
/**
 * Estimate token amount received for `solIn` (in SOL, as a number).
 * Uses the virtual reserves (constant-product AMM formula).
 * Accounts for the ~1% Pump.fun buy fee.
 *
 * Returns estimated token amount as a BigInt (raw, 6 decimals).
 */
export function estimateTokensFromBuy(curve, solInSol) {
  const FEE_BPS = 100n; // 1%
  const lamports = BigInt(Math.floor(solInSol * 1_000_000_000));
  const netLamports = lamports - (lamports * FEE_BPS / 10_000n);

  const { virtualSolReserves, virtualTokenReserves } = curve;
  const newSolReserves = virtualSolReserves + netLamports;
  const newTokenReserves = virtualSolReserves * virtualTokenReserves / newSolReserves;
  const tokensOut = virtualTokenReserves - newTokenReserves;
  return tokensOut > 0n ? tokensOut : 0n;
}

/**
 * Estimate SOL value of `tokenAmount` (BigInt, 6 decimals) using current
 * virtual reserves.  Used for paper-trading P&L.
 */
export function estimateSolFromSell(curve, tokenAmount) {
  const { virtualSolReserves, virtualTokenReserves } = curve;
  // k = sol * token
  const newTokenReserves = virtualTokenReserves + tokenAmount;
  const newSolReserves = virtualSolReserves * virtualTokenReserves / newTokenReserves;
  const solOut = virtualSolReserves - newSolReserves;
  const FEE_BPS = 100n;
  const netSol = solOut - (solOut * FEE_BPS / 10_000n);
  return Number(netSol) / 1_000_000_000; // lamports → SOL
}

// ── RPC helpers ───────────────────────────────────────────────────────────────
/**
 * Fetch and parse bonding curve for a single mint.
 * Returns { curve, completionPct, bondingCurvePDA } or null.
 */
export async function fetchBondingCurve(connection, mint) {
  try {
    const pda = getBondingCurvePDA(mint);
    const info = await connection.getAccountInfo(pda, 'confirmed');
    if (!info) return null;
    const curve = parseBondingCurve(info.data);
    if (!curve) return null;
    return {
      curve,
      completionPct: getCompletionPct(curve.realTokenReserves),
      bondingCurvePDA: pda,
    };
  } catch {
    return null;
  }
}

/**
 * Scan all incomplete bonding curves and return those at or above minPct.
 * Uses getProgramAccounts with memcmp filter — expensive, call infrequently.
 */
export async function findNearGraduationTokens(connection, minPct = 85) {
  // Encode complete=false (0x00) at offset 48
  const completeFilter = {
    memcmp: {
      offset: 48,
      bytes: 'deadbeefdeadbeef'.slice(0, 2), // will be overridden below
    },
  };

  // Build proper base58 encoding of [0x00]
  // We use a manual approach since we don't import bs58
  completeFilter.memcmp.bytes = Buffer.from([0]).toString('base64');

  let accounts;
  try {
    accounts = await connection.getProgramAccounts(PUMP_PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        { dataSize: 49 },
        { memcmp: { offset: 48, bytes: Buffer.from([0]).toString('base64') } },
      ],
      encoding: 'base64',
    });
  } catch (err) {
    // getProgramAccounts can fail on rate-limited public RPC — return empty
    console.error('[bonding-curve] getProgramAccounts failed:', err.message);
    return [];
  }

  const results = [];
  for (const { pubkey, account } of accounts) {
    const data = Buffer.from(account.data[0], 'base64');
    const curve = parseBondingCurve(data);
    if (!curve || curve.complete) continue;

    const completionPct = getCompletionPct(curve.realTokenReserves);
    if (completionPct >= minPct) {
      // Reverse-engineer the mint from the PDA seeds is not straightforward,
      // so we store the bonding curve address and mark mint as unknown here.
      // The monitor will resolve the mint via metadata or trade events.
      results.push({
        bondingCurveAddress: pubkey.toBase58(),
        completionPct,
        curve,
      });
    }
  }

  // Sort descending by completion
  results.sort((a, b) => b.completionPct - a.completionPct);
  return results;
}
