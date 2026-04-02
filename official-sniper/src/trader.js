import { estimateTokensFromBuy, estimateSolFromSell } from './bonding-curve.js';

const PUMPDEV_TRADE_URL = 'https://pumpportal.fun/api/trade-lightning';

// ── Trader ────────────────────────────────────────────────────────────────────
export class Trader {
  constructor(config) {
    this.apiKey   = config.pumpdevApiKey;
    this.testMode = config.testMode;
    this.slippage = config.slippagePct;
  }

  /**
   * Buy `amountSol` worth of `mint` tokens.
   * Returns { signature, solscan, simulated, tokensEstimate }
   */
  async buy(mint, amountSol, curve = null) {
    const result = await this._executeTrade({
      action: 'buy',
      mint,
      amount: amountSol,
      denominatedInSol: 'true',
      slippage: this.slippage,
    }, curve, amountSol);

    return result;
  }

  /**
   * Sell `tokenAmount` (BigInt, raw 6-decimal units) of `mint`.
   * Pass "100%" to sell all — PumpDev supports this shorthand.
   * Returns { signature, solscan, simulated, solEstimate }
   */
  async sell(mint, tokenAmount, curve = null) {
    // Use "100%" shorthand when selling entire position
    const amount = tokenAmount === '100%'
      ? '100%'
      : (typeof tokenAmount === 'bigint'
          ? (Number(tokenAmount) / 1_000_000).toString()
          : tokenAmount.toString());

    const result = await this._executeTrade({
      action: 'sell',
      mint,
      amount,
      denominatedInSol: 'false',
      slippage: this.slippage,
    }, curve, null, tokenAmount);

    return result;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  async _executeTrade(params, curve, solIn, tokenIn) {
    if (this.testMode) {
      return this._simulateTrade(params, curve, solIn, tokenIn);
    }
    return this._liveTradeWithRetry(params);
  }

  async _liveTradeWithRetry(params, maxRetries = 2) {
    const url = `${PUMPDEV_TRADE_URL}?api-key=${this.apiKey}`;
    let lastErr;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }

        const data = await res.json();

        if (!data.signature) {
          throw new Error(`No signature in response: ${JSON.stringify(data)}`);
        }

        return {
          signature: data.signature,
          solscan: data.solscan || `https://solscan.io/tx/${data.signature}`,
          simulated: false,
        };
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    throw new Error(`Trade failed after ${maxRetries + 1} attempts: ${lastErr.message}`);
  }

  _simulateTrade(params, curve, solIn, tokenIn) {
    const sig = `SIM_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const result = {
      signature: sig,
      solscan: null,
      simulated: true,
    };

    if (params.action === 'buy' && curve && solIn) {
      const tokensEstimate = estimateTokensFromBuy(curve, solIn);
      result.tokensEstimate = tokensEstimate;
    }

    if (params.action === 'sell' && curve && tokenIn && tokenIn !== '100%') {
      const solEstimate = estimateSolFromSell(curve, tokenIn);
      result.solEstimate = solEstimate;
    } else if (params.action === 'sell') {
      // Post-graduation sell — estimate not available without AMM pool data
      result.solEstimate = null;
    }

    return result;
  }
}
