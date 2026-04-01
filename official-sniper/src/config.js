import dotenv from 'dotenv';
dotenv.config();

export const config = Object.freeze({
  // PumpDev API
  pumpdevApiKey:      process.env.PUMPDEV_API_KEY || '',

  // Solana RPC
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',

  // Mode — default TRUE so nobody accidentally trades real money
  testMode: process.env.TEST_MODE !== 'false',

  // Entry
  buyAmountSol:      parseFloat(process.env.BUY_AMOUNT_SOL       || '0.05'),
  entryThresholdPct: parseFloat(process.env.ENTRY_THRESHOLD_PCT  || '96'),
  slippagePct:       parseInt(  process.env.SLIPPAGE_PCT         || '25',  10),

  // Exit
  trailingStopPct:   parseFloat(process.env.TRAILING_STOP_PCT    || '15'),
  hardStopLossPct:   parseFloat(process.env.HARD_STOP_LOSS_PCT   || '30'),

  // Risk limits
  maxPositions:       parseInt( process.env.MAX_POSITIONS         || '3',   10),
  dailyLossLimitSol:  parseFloat(process.env.DAILY_LOSS_LIMIT_SOL || '0.15'),

  // Monitoring
  scanIntervalMs:     parseInt( process.env.SCAN_INTERVAL_MS      || '30000', 10),
  graduationDelayMs:  parseInt( process.env.GRADUATION_DELAY_MS   || '5000',  10),
  dashboardRefreshMs: parseInt( process.env.DASHBOARD_REFRESH_MS  || '2000',  10),
  discoveryMinPct:    parseFloat(process.env.DISCOVERY_MIN_PCT    || '85'),
});

export function validateConfig() {
  if (!config.testMode && !config.pumpdevApiKey) {
    throw new Error(
      'PUMPDEV_API_KEY is required when TEST_MODE=false.\n' +
      'Get your key at https://pumpdev.io  — or keep TEST_MODE=true to paper trade.'
    );
  }

  if (config.solanaRpcUrl.includes('api.mainnet-beta.solana.com')) {
    console.warn(
      '\x1b[33m[WARN] Using public Solana RPC — rate limits will slow discovery scans.\x1b[0m\n' +
      '       Set SOLANA_RPC_URL to a Helius/QuickNode/Triton endpoint for best results.\n'
    );
  }

  if (config.buyAmountSol > 0.5 && config.testMode) {
    console.warn('\x1b[33m[WARN] BUY_AMOUNT_SOL is high but TEST_MODE=true — no real funds at risk.\x1b[0m');
  }
}
