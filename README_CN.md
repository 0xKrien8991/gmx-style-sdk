# GMX-Style SDK

基于 Node.js/TypeScript 的 GMX V2 风格去中心化永续合约交易所 SDK（Celo 链）。

> ⚠️ 本 SDK 目前仅支持 **开仓**（MarketIncrease）和 **平仓**（MarketDecrease）操作。

## 安装

```bash
npm install gmx-style-sdk
```

## 快速开始

```typescript
import { UpdownSDK, SDKError } from "gmx-style-sdk";
import { ethers } from "ethers";

// 方式一: 直接传入私钥（默认 Celo RPC）
const sdk = UpdownSDK.fromPrivateKey("YOUR_PRIVATE_KEY");

// 方式二: 从环境变量读取（PRIVATE_KEY, 可选 RPC_URL）
const sdk2 = UpdownSDK.fromEnv();

// 方式三: 自定义配置
const sdk3 = UpdownSDK.fromPrivateKey("YOUR_PRIVATE_KEY", {
  rpcUrl: "https://your-rpc.com",
  confirmations: 2,       // 等待 2 个区块确认
  txTimeout: 120000,      // 超时 120 秒
  contracts: {            // 覆盖默认合约地址
    exchangeRouter: "0x...",
  },
});

// 授权保证金代币（仅需一次）
await sdk.approveToken("0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e");

// 开多仓
try {
  const result = await sdk.openPosition({
    market: "0xd96a1ac57a180a3819633bce3dc602bd8972f595",
    collateralToken: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    collateralAmount: ethers.parseUnits("5", 6),       // 5 USDT
    sizeDeltaUsd: ethers.parseUnits("10", 30),          // 10 USD 仓位
    isLong: true,
    acceptablePrice: ethers.parseUnits("99999", 30),
    executionFee: ethers.parseEther("0.35"),
  });
  console.log("交易哈希:", result.hash);
  console.log("区块号:", result.receipt.blockNumber);
} catch (err) {
  if (err instanceof SDKError) {
    console.error("失败:", err.message);
    console.error("Revert 原因:", err.revertReason);
  }
}

// 平仓
const closeResult = await sdk.closePosition({
  market: "0xd96a1ac57a180a3819633bce3dc602bd8972f595",
  collateralToken: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  sizeDeltaUsd: ethers.parseUnits("10", 30),
  isLong: true,
  acceptablePrice: 0n,
  executionFee: ethers.parseEther("0.35"),
});
```

## 配置项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `rpcUrl` | `string` | Celo 主网 | JSON-RPC 节点地址 |
| `confirmations` | `number` | `1` | 等待区块确认数 |
| `txTimeout` | `number` | `60000` | 交易确认超时时间（毫秒） |
| `contracts` | `Partial<ContractAddresses>` | Celo 默认值 | 覆盖合约地址 |

### 环境变量

使用 `UpdownSDK.fromEnv()` 时：

| 变量 | 必需 | 说明 |
|------|------|------|
| `PRIVATE_KEY` | 是 | 钱包私钥 |
| `RPC_URL` | 否 | 自定义 RPC 节点 |

## API 文档

### `UpdownSDK.fromPrivateKey(privateKey, config?)`

通过私钥创建 SDK 实例，默认连接 Celo 主网 RPC。

### `UpdownSDK.fromEnv(config?)`

从环境变量创建 SDK 实例。

### `sdk.approveToken(tokenAddress, amount?)`

授权抵押品代币给 Router 合约。已授权则返回 `null`。每种代币只需调用一次。

### `sdk.openPosition(params): Promise<OrderResult>` — 开仓

创建 `MarketIncrease` 订单，开启永续合约仓位。

| 参数 | 类型 | 说明 |
|------|------|------|
| `market` | `string` | 市场代币地址 |
| `collateralToken` | `string` | 保证金代币地址 |
| `collateralAmount` | `bigint` | 保证金数量（代币原始精度） |
| `sizeDeltaUsd` | `bigint` | 仓位大小，USD 计价（30 位精度） |
| `isLong` | `boolean` | `true` 做多，`false` 做空 |
| `acceptablePrice` | `bigint` | 做多传极大值，做空传 0（30 位精度） |
| `executionFee` | `bigint` | 执行费，CELO（wei 单位） |
| `swapPath?` | `string[]` | 可选，swap 路径 |
| `referralCode?` | `string` | 可选，推荐码 |

### `sdk.closePosition(params): Promise<OrderResult>` — 平仓

创建 `MarketDecrease` 订单，关闭永续合约仓位。

| 参数 | 类型 | 说明 |
|------|------|------|
| `market` | `string` | 市场代币地址 |
| `collateralToken` | `string` | 保证金代币地址 |
| `sizeDeltaUsd` | `bigint` | 要平掉的仓位大小（30 位精度） |
| `isLong` | `boolean` | 仓位方向 |
| `acceptablePrice` | `bigint` | 平多传极小值，平空传极大值（30 位精度） |
| `executionFee` | `bigint` | 执行费，CELO（wei 单位） |
| `minOutputAmount?` | `bigint` | 最小输出数量 |
| `decreasePositionSwapType?` | `enum` | PnL swap 类型 |

### `OrderResult` 返回结果

`openPosition` 和 `closePosition` 返回：

```typescript
interface OrderResult {
  hash: string;                        // 交易哈希
  receipt: TransactionReceipt;         // 完整交易回执
  logs: Log[];                         // 解析后的事件日志
}
```

### 错误处理

所有交易错误统一包装为 `SDKError`：

```typescript
class SDKError extends Error {
  cause?: unknown;          // 原始错误
  txHash?: string;          // 交易哈希（如果已发送）
  revertReason?: string;    // 合约 revert 原因
}
```

## 工作原理

SDK 通过 `ExchangeRouter` 合约的 `multicall` 方法与链上交互：

**开仓流程：**
```
multicall([
  sendWnt(orderVault, executionFee),        // 发送 CELO 作为执行费
  sendTokens(token, orderVault, amount),    // 发送保证金到 OrderVault
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

## 已知限制

- 支持 Market、Limit、Stop-Loss 订单，不支持 TWAP 订单
- 未集成 Reader 合约 — 无法链上查询持仓、价格、流动性
- 仅支持私钥导入 — 暂不支持钱包连接（MetaMask / WalletConnect）
- 无并发 nonce 管理
- 无 gas 自动估算 — 使用默认 gas limit

## 构建

```bash
npm install
npm run build
```

## 许可证

MIT
