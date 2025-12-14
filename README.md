# FlowState AI - Smart Contract Security Scanner

## x402-Enabled API Service 💰

A pay-per-use smart contract security scanner that accepts **USDC payments** via the x402 protocol. AI agents and developers can scan Solidity contracts for vulnerabilities and pay per request - no subscriptions, no API keys needed.

**Built by [Flow State AI](https://flowstateai.agency)**

---

## 🎯 What This Does

When deployed, your service will:
1. **Appear in the x402 Bazaar** - AI agents can discover and pay for your service automatically
2. **Accept USDC payments** on Base network for each API call
3. **Send payments directly to your wallet** - no middleman

### Pricing
| Endpoint | Price | Description |
|----------|-------|-------------|
| `/api/scan/quick` | $0.05 | Quick vulnerability scan |
| `/api/scan/deep` | $0.50 | Comprehensive security audit |
| `/api/compare` | $0.10 | Compare two contracts |
| `/api/report` | $1.00 | Professional audit report |

---

## 🚀 Quick Start

### 1. Get Your Wallet Ready

You need a wallet address on Base network to receive USDC payments.
- Use MetaMask, Coinbase Wallet, or any EVM wallet
- Copy your wallet address (starts with 0x...)
- **For testing**: Get testnet USDC from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your wallet address:
```
WALLET_ADDRESS=0xYourActualWalletAddress
NETWORK=base-sepolia  # Use "base" for production
FACILITATOR_URL=https://x402.org/facilitator
```

### 3. Install & Run

```bash
npm install
npm start
```

Your server will start on `http://localhost:4021`

---

## 🌐 Deployment Options

### Option A: Railway (Easiest - $5/month)

1. Push to GitHub
2. Go to [railway.app](https://railway.app)
3. New Project → Deploy from GitHub
4. Add environment variables in dashboard
5. Railway gives you a public URL automatically

### Option B: Render (Free tier available)

1. Push to GitHub  
2. Go to [render.com](https://render.com)
3. New → Web Service → Connect repo
4. Add environment variables
5. Deploy

### Option C: Fly.io (Generous free tier)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Deploy
fly launch
fly secrets set WALLET_ADDRESS=0xYourWallet
fly secrets set NETWORK=base
fly secrets set FACILITATOR_URL=https://x402.coinbase.com
fly deploy
```

### Option D: VPS (DigitalOcean, Linode, etc.)

```bash
# On your server
git clone <your-repo>
cd flowstate-contract-scanner
npm install
cp .env.example .env
# Edit .env with your wallet

# Run with PM2 (process manager)
npm install -g pm2
pm2 start index.js --name contract-scanner
pm2 save
pm2 startup
```

---

## 📡 Getting Listed in x402 Bazaar

Your service automatically registers in the x402 Bazaar when:
1. You're using the CDP facilitator (`https://x402.coinbase.com`)
2. Your endpoints have `discoverable: true` in config
3. Your server is publicly accessible

The Bazaar is how AI agents discover your service!

Check if you're listed: `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`

---

## 🧪 Testing Your Service

### Test without payment (returns 402):
```bash
curl http://localhost:4021/api/scan/quick \
  -H "Content-Type: application/json" \
  -d '{"code": "pragma solidity ^0.8.0; contract Test {}"}'
```

Response will be `402 Payment Required` with payment instructions.

### Test the health endpoint (free):
```bash
curl http://localhost:4021/
```

---

## 📊 Revenue Potential

If your service processes:
- 100 quick scans/day = $5/day = **$150/month**
- 20 deep audits/day = $10/day = **$300/month**  
- 5 reports/day = $5/day = **$150/month**

**Conservative estimate: $300-600/month passive income**

As AI agents proliferate, demand will grow exponentially.

---

## 🔒 Going to Production

### 1. Switch to Mainnet

In your `.env`:
```
NETWORK=base
FACILITATOR_URL=https://x402.coinbase.com
```

### 2. Use HTTPS

Always deploy behind HTTPS (Railway, Render, Fly.io handle this automatically)

### 3. Monitor Your Wallet

Your USDC payments go directly to your wallet on Base. Track at:
- [Basescan](https://basescan.org/address/YOUR_ADDRESS)

---

## 🛠 Customization Ideas

Want to make this even more valuable? Add:

1. **More vulnerability patterns** - Add detection for flash loan attacks, front-running, etc.
2. **AI-powered analysis** - Integrate OpenAI/Claude for deeper insights
3. **Multi-chain support** - Add Solana, Polygon support
4. **Webhook notifications** - Alert when high-severity issues found
5. **Historical tracking** - Store scan results for clients

---

## 📞 Support

- **x402 Protocol**: [x402.org](https://x402.org) | [Discord](https://discord.gg/cdp)
- **Author**: Flow State AI - [flowstateai.agency](https://flowstateai.agency)

---

## License

MIT - Use this however you want. Build your own version. Make money.

---

*Built with x402 - the future of internet payments* 🚀
