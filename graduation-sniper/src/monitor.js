import { EventEmitter } from 'events';
import { Connection, PublicKey } from '@solana/web3.js';
import WebSocket from 'ws';
import {
  getBondingCurvePDA,
  fetchBondingCurve,
  getCompletionPct,
  findNearGraduationTokens,
} from './bonding-curve.js';

const PUMPDEV_WS_URL = 'wss://pumpportal.fun/api/data';

// ── GraduationMonitor ─────────────────────────────────────────────────────────
/**
 * Monitors the Pump.fun bonding curve ecosystem for tokens approaching graduation.
 *
 * Emits:
 *   'token-discovered'  { mint, completionPct }
 *   'entry-signal'      { mint, completionPct, curve }
 *   'graduation'        { mint }
 *   'price-tick'        { mint, completionPct, curve, currentValueSol }
 *   'log'               string message for dashboard
 */
export class GraduationMonitor extends EventEmitter {
  constructor(connection, config) {
    super();
    this.connection = connection;
    this.config = config;

    // Map<mint string → { completionPct, curve, entryFired, graduationFired, lastUpdate }>
    this.watchedTokens = new Map();

    this._ws = null;
    this._wsConnected = false;
    this._wsReconnectDelay = 1000;
    this._wsReconnectTimer = null;
    this._scanTimer = null;
    this._stopped = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async start() {
    this._stopped = false;
    this.emit('log', 'Monitor starting...');

    // Connect WebSocket for real-time new token + trade events
    this._connectWebSocket();

    // Run an initial discovery scan immediately
    await this._discoveryScan();

    // Then schedule periodic scans
    this._scanTimer = setInterval(() => this._discoveryScan(), this.config.scanIntervalMs);

    this.emit('log', 'Monitor running.');
  }

  async stop() {
    this._stopped = true;
    if (this._scanTimer) clearInterval(this._scanTimer);
    if (this._wsReconnectTimer) clearTimeout(this._wsReconnectTimer);
    if (this._ws) {
      this._ws.removeAllListeners();
      this._ws.close();
    }
  }

  /** Manually add a mint to the watch list (e.g. from external source) */
  async watchMint(mint) {
    if (this.watchedTokens.has(mint)) return;
    const result = await fetchBondingCurve(this.connection, mint);
    if (!result) return;

    const { curve, completionPct } = result;
    if (curve.complete) return; // already graduated

    this.watchedTokens.set(mint, {
      completionPct,
      curve,
      entryFired: false,
      graduationFired: false,
      lastUpdate: Date.now(),
    });

    this._subscribeTokenTrade(mint);
    this.emit('token-discovered', { mint, completionPct });
    this.emit('log', `Watching ${_short(mint)} at ${completionPct.toFixed(1)}%`);
  }

  // ── Discovery ───────────────────────────────────────────────────────────────

  async _discoveryScan() {
    if (this._stopped) return;
    this.emit('log', 'Running discovery scan...');

    try {
      const found = await findNearGraduationTokens(
        this.connection,
        this.config.discoveryMinPct
      );

      this.emit('log', `Discovery: found ${found.length} tokens >= ${this.config.discoveryMinPct}%`);

      for (const { bondingCurveAddress, completionPct, curve } of found) {
        // We don't have the mint from getProgramAccounts (we'd need reverse lookup),
        // so use the bonding curve address as a temporary key and subscribe to
        // new-token events from the WebSocket to correlate.
        // For direct mint tracking, we rely on WebSocket new token events.
        // This scan primarily gives us a count for dashboard awareness.
        _ = bondingCurveAddress; // suppress lint
        _ = completionPct;
        _ = curve;
      }
    } catch (err) {
      this.emit('log', `Discovery scan error: ${err.message}`);
    }
  }

  // ── WebSocket ───────────────────────────────────────────────────────────────

  _connectWebSocket() {
    if (this._stopped) return;

    try {
      this._ws = new WebSocket(PUMPDEV_WS_URL);
    } catch (err) {
      this.emit('log', `WS connect error: ${err.message}`);
      this._scheduleReconnect();
      return;
    }

    this._ws.on('open', () => {
      this._wsConnected = true;
      this._wsReconnectDelay = 1000; // reset backoff on successful connect
      this.emit('log', 'WebSocket connected to PumpPortal');

      // Subscribe to new token launches so we can track mints from birth
      this._wsSend({ method: 'subscribeNewToken' });

      // Re-subscribe all currently watched tokens
      for (const mint of this.watchedTokens.keys()) {
        this._subscribeTokenTrade(mint);
      }
    });

    this._ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this._handleWsMessage(msg);
      } catch {
        // ignore malformed messages
      }
    });

    this._ws.on('close', () => {
      this._wsConnected = false;
      this.emit('log', 'WebSocket disconnected — reconnecting...');
      this._scheduleReconnect();
    });

    this._ws.on('error', (err) => {
      this._wsConnected = false;
      this.emit('log', `WebSocket error: ${err.message}`);
    });
  }

  _scheduleReconnect() {
    if (this._stopped) return;
    this._wsReconnectTimer = setTimeout(() => {
      this._connectWebSocket();
    }, this._wsReconnectDelay);
    this._wsReconnectDelay = Math.min(this._wsReconnectDelay * 2, 30_000);
  }

  _wsSend(payload) {
    if (this._ws && this._wsConnected) {
      try {
        this._ws.send(JSON.stringify(payload));
      } catch {
        // ignore send errors; reconnect will handle it
      }
    }
  }

  _subscribeTokenTrade(mint) {
    this._wsSend({ method: 'subscribeTokenTrade', keys: [mint] });
  }

  // ── Message handling ────────────────────────────────────────────────────────

  async _handleWsMessage(msg) {
    // New token launched
    if (msg.txType === 'create' && msg.mint) {
      await this._onNewToken(msg.mint, msg);
      return;
    }

    // Trade on a watched token
    if ((msg.txType === 'buy' || msg.txType === 'sell') && msg.mint) {
      await this._onTrade(msg.mint, msg);
      return;
    }
  }

  async _onNewToken(mint, _meta) {
    // New tokens start at 0% — subscribe and check periodically
    // We only add to watchList once they cross discoveryMinPct
    this._subscribeTokenTrade(mint);
  }

  async _onTrade(mint, tradeMsg) {
    if (this._stopped) return;

    // Throttle: don't re-check the same token more than once per second
    const existing = this.watchedTokens.get(mint);
    if (existing && Date.now() - existing.lastUpdate < 800) return;

    // Fetch fresh bonding curve data
    const result = await withRetry(() => fetchBondingCurve(this.connection, mint), 2, 500);
    if (!result) return;

    const { curve, completionPct } = result;

    // Graduated — no longer on bonding curve
    if (curve.complete) {
      if (existing && !existing.graduationFired) {
        existing.graduationFired = true;
        this.emit('graduation', { mint });
        this.emit('log', `GRADUATED ${_short(mint)}`);
      }
      return;
    }

    // Below discovery threshold — ignore
    if (completionPct < this.config.discoveryMinPct) return;

    // Add to watch list if new
    if (!existing) {
      this.watchedTokens.set(mint, {
        completionPct,
        curve,
        entryFired: false,
        graduationFired: false,
        lastUpdate: Date.now(),
      });
      this.emit('token-discovered', { mint, completionPct });
      this.emit('log', `Discovered ${_short(mint)} at ${completionPct.toFixed(1)}%`);
    } else {
      existing.completionPct = completionPct;
      existing.curve = curve;
      existing.lastUpdate = Date.now();
    }

    const token = this.watchedTokens.get(mint);

    // Emit price tick for open positions
    const solValue = _estimatePositionValue(curve, tradeMsg);
    this.emit('price-tick', { mint, completionPct, curve, currentValueSol: solValue });

    // Entry signal: crossed threshold and hasn't fired yet
    if (
      !token.entryFired &&
      completionPct >= this.config.entryThresholdPct &&
      completionPct < 100
    ) {
      token.entryFired = true;
      this.emit('entry-signal', { mint, completionPct, curve });
      this.emit('log', `ENTRY SIGNAL ${_short(mint)} at ${completionPct.toFixed(1)}%`);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _short(mint) {
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

/**
 * Rough SOL value estimate from a trade message.
 * Trade messages from PumpPortal contain `solAmount` (in SOL).
 * We use the last trade price as a proxy for current position value.
 */
function _estimatePositionValue(curve, tradeMsg) {
  // tradeMsg.solAmount is in SOL (float), tradeMsg.tokenAmount is in tokens
  // Approximate: value = (position tokens / trade tokens) * trade solAmount
  // The caller (position-manager) does the actual P&L math — this is just a signal
  if (tradeMsg && tradeMsg.solAmount && tradeMsg.tokenAmount && tradeMsg.tokenAmount > 0) {
    // Price per token in SOL
    const pricePerToken = tradeMsg.solAmount / tradeMsg.tokenAmount;
    return pricePerToken; // position-manager will multiply by tokensHeld
  }
  return null;
}

async function withRetry(fn, maxRetries = 3, baseDelayMs = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }
}

// Suppress unused variable warnings for discovery scan placeholder
function _() {}
