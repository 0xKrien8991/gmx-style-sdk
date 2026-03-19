# UpDown SDK

基于 Node.js/TypeScript 的 [UpDown](https://app.updown.xyz) 去中心化永续合约交易所 SDK（Celo 链），支持开仓和平仓操作。

UpDown 是 GMX V2 的 Fork，支持低滑点永续合约交易，最高 100 倍杠杆。

## 安装

```bash
npm install @updown/sdk
```

## 快速开始

```typescript
import { UpdownSDK } from "@updown/sdk";
import { ethers } from "ethers";

const sdk = UpdownSDK.fromPrivateKey("YOUR_PRIVATE_KEY");

// 授权抵押品代币（仅需一次）
await sdk.approveToken("0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e");

// 开多仓
const openTx = await sdk.openPosition({
  market: "0xd96a1ac57a180a3819633bce3dc602bd8972f595",
  collateralToken: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  collateralAmount: ethers.parseUnits("5", 6),       // 5 USDT
  sizeDeltaUsd: ethers.parseUnits("10", 30),          // 10 USD 仓位
  isLong: true,
  acceptablePrice: ethers.parseUnits("99999", 30),    // 接受任意价格
  executionFee: ethers.parseEther("0.35"),             // 0.35 CELO
});
await openTx.wait();

// 平仓
const closeTx = await sdk.closePosition({
  market: "0xd96a1ac57a180a3819633bce3dc602bd8972f595",
  collateralToken: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  sizeDeltaUsd: ethers.parseUnits("10", 30),
  isLong: true,
  acceptablePrice: 0n,
  executionFee: ethers.parseEther("0.35"),
});
await closeTx.wait();
```

## API 文档

### `UpdownSDK.fromPrivateKey(privateKey, config?)`

通过私钥创建 SDK 实例，默认连接 Celo 主网 RPC。

### `sdk.approveToken(tokenAddress, amount?)`

授权抵押品代币给 Router 合约。已授权则返回 `null`。每种代币只需调用一次。

### `sdk.openPosition(params)` — 开仓

创建 `MarketIncrease` 订单，开启永续合约仓位。

| 参数 | 类型 | 说明 |
|------|------|------|
| `market` | `string` | 市场代币地址 |
| `collateralToken` | `string` | 抵押品代币地址 |
| `collateralAmount` | `bigint` | 抵押品数量（代币原始精度） |
| `sizeDeltaUsd` | `bigint` | 仓位大小，USD 计价（30 位精度） |
| `isLong` | `boolean` | `true` 做多，`false` 做空 |
| `acceptablePrice` | `bigint` | 做多传极大值，做空传 0（30 位精度） |
| `executionFee` | `bigint` | 执行费，CELO（wei 单位） |
| `swapPath?` | `string[]` | 可选，swap 路径 |
| `referralCode?` | `string` | 可选，推荐码 |

### `sdk.closePosition(params)` — 平仓

创建 `MarketDecrease` 订单，关闭永续合约仓位。

| 参数 | 类型 | 说明 |
|------|------|------|
| `market` | `string` | 市场代币地址 |
| `collateralToken` | `string` | 抵押品代币地址 |
| `sizeDeltaUsd` | `bigint` | 要平掉的仓位大小（30 位精度） |
| `isLong` | `boolean` | 仓位方向 |
| `acceptablePrice` | `bigint` | 平多传极小值，平空传极大值（30 位精度） |
| `executionFee` | `bigint` | 执行费，CELO（wei 单位） |
| `minOutputAmount?` | `bigint` | 最小输出数量 |
| `decreasePositionSwapType?` | `enum` | PnL swap 类型 |

## 工作原理

SDK 通过 `ExchangeRouter` 合约的 `multicall` 方法与链上交互：

**开仓流程：**
```
multicall([
  sendWnt(orderVault, executionFee),        // 发送 CELO 作为执行费
  sendTokens(token, orderVault, amount),    // 发送抵押品到 OrderVault
  createOrder(params)                       // 创建 MarketIncrease 订单
])
```

**平仓流程：**
```
multicall([
  sendWnt(orderVault, executionFee),        // 发送 CELO 作为执行费
  createOrder(params)                       // 创建 MarketDecrease 订单
])
```

订单创建后，链上的 Keeper 会自动执行该订单。

## 合约地址（Celo 链）

| 合约 | 地址 |
|------|------|
| ExchangeRouter | `0x20095BB2Fe7C8d25D15d6e5985b29755Ef57EecE` |
| Router | `0x5C1e75b8425F9B0de50F8aA5846189fe8676e463` |
| OrderVault | `0x3153298B530048dD4E079cB9156d9A2DFdA9F0Dc` |
| DataStore | `0x2808efda9b6c464208d14af22a793ad1725d5836` |

## 构建

```bash
npm install
npm run build
```

## 许可证

MIT
