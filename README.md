[English](README.md) | [中文](README_CN.md)

# GMX-Style SDK

A Node.js/TypeScript SDK for **opening and closing** perpetual positions on GMX V2-style decentralized exchanges (Celo chain).

> ⚠️ This SDK supports **open position** and **close position** with Market, Limit, and Stop-Loss order types.

## Installation

```bash
npm install gmx-style-sdk
```

## Quick Start

```typescript
import { UpdownSDK, SDKError } from "gmx-style-sdk";
import { ethers } from "ethers";

// Method 1: From private key (default Celo RPC)
const sdk = UpdownSDK.fromPrivateKey("YOUR_PRIVATE_KEY");

// Method 2: From environment variables (PRIVATE_KEY, optional RPC_URL)
const sdk2 = UpdownSDK.fromEnv();

// Method 3: Custom config
const sdk3 = UpdownSDK.fromPrivateKey("YOUR_PRIVATE_KEY", {
  rpcUrl: "https://your-rpc.com",
  confirmations: 2,
  txTimeout: 120000,
  contracts: {
    exchangeRouter: "0x...",  // override default addresses
  },
});

// Approve collateral token (one-time)
await sdk.approveToken("0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e");

// Open a long position
try {
  const result = await sdk.openPosition({
    market: "0xd96a1ac57a180a3819633bce3dc602bd8972f595",
    collateralToken: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    collateralAmount: ethers.parseUnits("5", 6),       // 5 USDT
    sizeDeltaUsd: ethers.parseUnits("10", 30),          // 10 USD position
    isLong: true,
    acceptablePrice: ethers.parseUnits("99999", 30),
    executionFee: ethers.parseEther("0.35"),
  });
  console.log("TX:", result.hash);
  console.log("Block:", result.receipt.blockNumber);
} catch (err) {
  if (err instanceof SDKError) {
    console.error("Failed:", err.message);
    console.error("Revert:", err.revertReason);
  }
}

// Close the position
const closeResult = await sdk.closePosition({
  market: "0xd96a1ac57a180a3819633bce3dc602bd8972f595",
  collateralToken: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  sizeDeltaUsd: ethers.parseUnits("10", 30),
  isLong: true,
  acceptablePrice: 0n,
  executionFee: ethers.parseEther("0.35"),
});
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rpcUrl` | `string` | Celo mainnet | JSON-RPC endpoint |
| `confirmations` | `number` | `1` | Block confirmations to wait |
| `txTimeout` | `number` | `60000` | TX confirmation timeout (ms) |
| `contracts` | `Partial<ContractAddresses>` | Celo defaults | Override contract addresses |

### Environment Variables

When using `UpdownSDK.fromEnv()`:

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | Yes | Wallet private key |
| `RPC_URL` | No | Custom RPC endpoint |

## API

### `UpdownSDK.fromPrivateKey(privateKey, config?)`

Create an SDK instance from a private key. Uses Celo mainnet RPC by default.

### `UpdownSDK.fromEnv(config?)`

Create an SDK instance from environment variables.

### `sdk.approveToken(tokenAddress, amount?)`

Approve a collateral token to the Router contract. Returns `null` if already approved. Only needs to be called once per token.

### `sdk.openPosition(params): Promise<OrderResult>`

Open a perpetual position (creates a `MarketIncrease` order).

| Parameter | Type | Description |
|-----------|------|-------------|
| `market` | `string` | Market token address |
| `collateralToken` | `string` | Collateral token address |
| `collateralAmount` | `bigint` | Collateral amount (token decimals) |
| `sizeDeltaUsd` | `bigint` | Position size in USD (30 decimals) |
| `isLong` | `boolean` | `true` for long, `false` for short |
| `acceptablePrice` | `bigint` | Max price for longs, min price for shorts (30 decimals) |
| `executionFee` | `bigint` | Execution fee in CELO (wei) |
| `swapPath?` | `string[]` | Optional swap path |
| `referralCode?` | `string` | Optional referral code |

### `sdk.closePosition(params): Promise<OrderResult>`

Close a perpetual position (creates a `MarketDecrease` order).

| Parameter | Type | Description |
|-----------|------|-------------|
| `market` | `string` | Market token address |
| `collateralToken` | `string` | Collateral token address |
| `sizeDeltaUsd` | `bigint` | Size to close in USD (30 decimals) |
| `isLong` | `boolean` | Position direction |
| `acceptablePrice` | `bigint` | Min price for longs, max price for shorts (30 decimals) |
| `executionFee` | `bigint` | Execution fee in CELO (wei) |
| `minOutputAmount?` | `bigint` | Minimum output amount |
| `decreasePositionSwapType?` | `enum` | PnL swap type |

### `OrderResult`

Both `openPosition` and `closePosition` return an `OrderResult`:

```typescript
interface OrderResult {
  hash: string;                        // Transaction hash
  receipt: TransactionReceipt;         // Full transaction receipt
  logs: Log[];                         // Parsed event logs
}
```

### Error Handling

All transaction errors are wrapped in `SDKError`:

```typescript
class SDKError extends Error {
  cause?: unknown;          // Original error
  txHash?: string;          // TX hash (if sent)
  revertReason?: string;    // Contract revert reason
}
```

## How It Works

The SDK interacts with the `ExchangeRouter` contract via `multicall`:

**Open position:**
```
multicall([
  sendWnt(orderVault, executionFee),        // send CELO for execution fee
  sendTokens(token, orderVault, amount),    // send collateral
  createOrder(params)                       // create MarketIncrease order
])
```

**Close position:**
```
multicall([
  sendWnt(orderVault, executionFee),        // send CELO for execution fee
  createOrder(params)                       // create MarketDecrease order
])
```

After order creation, a keeper will execute the order on-chain.

## Contract Addresses (Celo)

| Contract | Address |
|----------|---------|
| ExchangeRouter | `0x20095BB2Fe7C8d25D15d6e5985b29755Ef57EecE` |
| Router | `0x5C1e75b8425F9B0de50F8aA5846189fe8676e463` |
| OrderVault | `0x3153298B530048dD4E079cB9156d9A2DFdA9F0Dc` |
| DataStore | `0x2808efda9b6c464208d14af22a793ad1725d5836` |

## Limitations

- Supports Market, Limit, and Stop-Loss orders. No TWAP orders.
- No Reader contract integration — cannot query positions, prices, or liquidity on-chain.
- Private key only — no wallet connection (MetaMask / WalletConnect) support yet.

## Build

```bash
npm install
npm run build
```

## License

MIT
