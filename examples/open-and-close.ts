import { UpdownSDK } from "../src";
import { ethers } from "ethers";

/**
 * 示例: 使用 UpDown SDK 开仓和平仓
 *
 * 已知市场:
 * - Market (wUSDT): 0xd96a1ac57a180a3819633bce3dc602bd8972f595
 * - USDT (Celo):    0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e
 */

const PRIVATE_KEY = "YOUR_PRIVATE_KEY";

// 市场和代币地址
const MARKET = "0xd96a1ac57a180a3819633bce3dc602bd8972f595";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";

async function main() {
  // 1. 初始化 SDK
  const sdk = UpdownSDK.fromPrivateKey(PRIVATE_KEY);
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
  const openTx = await sdk.openPosition({
    market: MARKET,
    collateralToken: USDT,
    collateralAmount: ethers.parseUnits("5", 6),        // 5 USDT
    sizeDeltaUsd: ethers.parseUnits("10", 30),           // 10 USD
    isLong: true,
    acceptablePrice: ethers.parseUnits("99999", 30),     // 极大值, 接受任意价格
    executionFee: ethers.parseEther("0.35"),              // 0.35 CELO
  });
  console.log("Open Position TX:", openTx.hash);
  await openTx.wait();
  console.log("Open order created! Waiting for keeper execution...");

  // 4. 全部平仓
  //    - sizeDeltaUsd 填和开仓一样的值 = 全部平仓
  //    - 平多仓 acceptablePrice 设为极小值 (接受任意价格)
  const closeTx = await sdk.closePosition({
    market: MARKET,
    collateralToken: USDT,
    sizeDeltaUsd: ethers.parseUnits("10", 30),           // 平掉全部 10 USD
    isLong: true,
    acceptablePrice: 0n,                                  // 极小值, 接受任意价格
    executionFee: ethers.parseEther("0.35"),
  });
  console.log("Close Position TX:", closeTx.hash);
  await closeTx.wait();
  console.log("Close order created! Waiting for keeper execution...");
}

main().catch(console.error);
