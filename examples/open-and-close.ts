import { UpdownSDK, SDKError, OrderType } from "../src";
import { ethers } from "ethers";

/**
 * 示例: 使用 SDK 开仓和平仓
 *
 * 已知市场:
 * - Market (wUSDT): 0xd96a1ac57a180a3819633bce3dc602bd8972f595
 * - USDT (Celo):    0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e
 */

// ==================== 方式一: 直接传入私钥 ====================
// const sdk = UpdownSDK.fromPrivateKey("YOUR_PRIVATE_KEY");

// ==================== 方式二: 从环境变量读取 ====================
// 设置环境变量: PRIVATE_KEY=0x..., 可选 RPC_URL=https://...
// const sdk = UpdownSDK.fromEnv();

// ==================== 方式三: 自定义配置 ====================
// const sdk = UpdownSDK.fromPrivateKey("YOUR_PRIVATE_KEY", {
//   rpcUrl: "https://your-custom-rpc.com",
//   confirmations: 2,       // 等待 2 个区块确认
//   txTimeout: 120000,      // 超时 120 秒
//   contracts: {            // 覆盖默认合约地址
//     exchangeRouter: "0x...",
//     router: "0x...",
//   },
// });

const PRIVATE_KEY = "YOUR_PRIVATE_KEY";

// 市场和代币地址
const MARKET = "0xd96a1ac57a180a3819633bce3dc602bd8972f595";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";

async function main() {
  // 1. 初始化 SDK
  const sdk = UpdownSDK.fromPrivateKey(PRIVATE_KEY, {
    confirmations: 1,
    txTimeout: 60000,
  });
  const address = await sdk.getAddress();
  console.log("Wallet:", address);

  // 2. 授权 USDT 给 Router (只需一次, 已授权则跳过)
  const approveTx = await sdk.approveToken(USDT);
  if (approveTx) {
    console.log("Approve TX:", approveTx.hash);
    await approveTx.wait();
    console.log("Approved!");
  } else {
    console.log("Already approved, skipped.");
  }

  // 3. 开多仓
  //    - 5 USDT 作为抵押品 (USDT 6位小数)
  //    - 仓位大小 10 USD (30位精度)
  //    - 做多, acceptablePrice 设为极大值 (允许任意成交价)
  //    - 执行费 0.35 CELO
  try {
    const openResult = await sdk.openPosition({
      market: MARKET,
      collateralToken: USDT,
      collateralAmount: ethers.parseUnits("5", 6),        // 5 USDT
      sizeDeltaUsd: ethers.parseUnits("10", 30),           // 10 USD
      isLong: true,
      acceptablePrice: ethers.parseUnits("99999", 30),     // 极大值, 接受任意价格
      executionFee: ethers.parseEther("0.35"),              // 0.35 CELO
    });
    console.log("Open Position TX:", openResult.hash);
    console.log("Block:", openResult.receipt.blockNumber);
    console.log("Gas used:", openResult.receipt.gasUsed.toString());
    console.log("Events:", openResult.logs.length);
    console.log("Open order created! Waiting for keeper execution...");
  } catch (err) {
    if (err instanceof SDKError) {
      console.error("Open position failed:", err.message);
      if (err.revertReason) console.error("Revert reason:", err.revertReason);
      if (err.txHash) console.error("TX hash:", err.txHash);
    }
    throw err;
  }

  // 4. 全部平仓
  //    - sizeDeltaUsd 填和开仓一样的值 = 全部平仓
  //    - 平多仓 acceptablePrice 设为极小值 (接受任意价格)
  try {
    const closeResult = await sdk.closePosition({
      market: MARKET,
      collateralToken: USDT,
      sizeDeltaUsd: ethers.parseUnits("10", 30),           // 平掉全部 10 USD
      isLong: true,
      acceptablePrice: 0n,                                  // 极小值, 接受任意价格
      executionFee: ethers.parseEther("0.35"),
    });
    console.log("Close Position TX:", closeResult.hash);
    console.log("Block:", closeResult.receipt.blockNumber);
    console.log("Gas used:", closeResult.receipt.gasUsed.toString());
    console.log("Close order created! Waiting for keeper execution...");
  } catch (err) {
    if (err instanceof SDKError) {
      console.error("Close position failed:", err.message);
      if (err.revertReason) console.error("Revert reason:", err.revertReason);
      if (err.txHash) console.error("TX hash:", err.txHash);
    }
    throw err;
  }

  // ==================== 限价单示例 ====================

  // 5. 限价开多 — 价格跌到 3000 USD 时买入
  try {
    const limitResult = await sdk.openPosition({
      market: MARKET,
      collateralToken: USDT,
      collateralAmount: ethers.parseUnits("5", 6),
      sizeDeltaUsd: ethers.parseUnits("10", 30),
      isLong: true,
      orderType: OrderType.LimitIncrease,
      triggerPrice: ethers.parseUnits("3000", 30),       // 触发价格 3000 USD
      acceptablePrice: ethers.parseUnits("3010", 30),    // 最多接受 3010 USD
      executionFee: ethers.parseEther("0.35"),
    });
    console.log("Limit Open TX:", limitResult.hash);
  } catch (err) {
    if (err instanceof SDKError) {
      console.error("Limit open failed:", err.message);
    }
    throw err;
  }

  // 6. 止损平仓 — 价格跌到 2800 USD 时自动平仓止损
  try {
    const stopLossResult = await sdk.closePosition({
      market: MARKET,
      collateralToken: USDT,
      sizeDeltaUsd: ethers.parseUnits("10", 30),
      isLong: true,
      orderType: OrderType.StopLossDecrease,
      triggerPrice: ethers.parseUnits("2800", 30),       // 跌到 2800 触发
      acceptablePrice: 0n,                                // 接受任意价格
      executionFee: ethers.parseEther("0.35"),
    });
    console.log("Stop-Loss TX:", stopLossResult.hash);
  } catch (err) {
    if (err instanceof SDKError) {
      console.error("Stop-loss failed:", err.message);
    }
    throw err;
  }
}

main().catch(console.error);
