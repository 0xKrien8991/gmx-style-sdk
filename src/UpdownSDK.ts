import { ethers, Signer, Contract, MaxUint256 } from "ethers";
import ExchangeRouterABI from "./abis/ExchangeRouter.json";
import ERC20ABI from "./abis/ERC20.json";
import {
  DEFAULT_CONTRACTS,
  CELO_RPC_URL,
  ZERO_ADDRESS,
  ZERO_BYTES32,
} from "./config";
import {
  ContractAddresses,
  CreateOrderParams,
  OpenPositionParams,
  ClosePositionParams,
  OrderType,
  DecreasePositionSwapType,
  UpdownConfig,
  OrderResult,
  SDKError,
} from "./types";

export class UpdownSDK {
  private signer: Signer;
  private contracts: ContractAddresses;
  private exchangeRouter: Contract;
  private confirmations: number;
  private txTimeout: number;

  constructor(signer: Signer, config?: UpdownConfig) {
    this.signer = signer;
    this.contracts = { ...DEFAULT_CONTRACTS, ...config?.contracts };
    this.confirmations = config?.confirmations ?? 1;
    this.txTimeout = config?.txTimeout ?? 60000;
    this.exchangeRouter = new Contract(
      this.contracts.exchangeRouter,
      ExchangeRouterABI,
      this.signer
    );
  }

  /**
   * 从私钥创建 SDK 实例
   */
  static fromPrivateKey(privateKey: string, config?: UpdownConfig): UpdownSDK {
    const provider = new ethers.JsonRpcProvider(
      config?.rpcUrl ?? CELO_RPC_URL
    );
    const signer = new ethers.Wallet(privateKey, provider);
    return new UpdownSDK(signer, config);
  }

  /**
   * 从环境变量创建 SDK 实例
   * 读取 PRIVATE_KEY 和可选的 RPC_URL
   */
  static fromEnv(config?: UpdownConfig): UpdownSDK {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new SDKError("Environment variable PRIVATE_KEY is not set");
    }
    return UpdownSDK.fromPrivateKey(privateKey, {
      rpcUrl: process.env.RPC_URL,
      ...config,
    });
  }

  /**
   * 授权代币给 Router 合约
   */
  async approveToken(
    tokenAddress: string,
    amount: bigint = MaxUint256
  ): Promise<ethers.TransactionResponse | null> {
    const token = new Contract(tokenAddress, ERC20ABI, this.signer);
    const owner = await this.signer.getAddress();
    const currentAllowance: bigint = await token.allowance(
      owner,
      this.contracts.router
    );
    if (currentAllowance >= amount) {
      return null;
    }
    return token.approve(this.contracts.router, amount);
  }

  /**
   * 开仓 - 创建 MarketIncrease 订单
   *
   * 流程: multicall([sendWnt, sendTokens, createOrder])
   * 返回 OrderResult, 包含交易回执和解析后的日志
   */
  async openPosition(params: OpenPositionParams): Promise<OrderResult> {
    const account = await this.signer.getAddress();

    const orderParams: CreateOrderParams = {
      addresses: {
        receiver: account,
        cancellationReceiver: account,
        callbackContract: ZERO_ADDRESS,
        uiFeeReceiver: ZERO_ADDRESS,
        market: params.market,
        initialCollateralToken: params.collateralToken,
        swapPath: params.swapPath ?? [],
      },
      numbers: {
        sizeDeltaUsd: params.sizeDeltaUsd,
        initialCollateralDeltaAmount: params.collateralAmount,
        triggerPrice: params.triggerPrice ?? 0n,
        acceptablePrice: params.acceptablePrice,
        executionFee: params.executionFee,
        callbackGasLimit: 0n,
        minOutputAmount: 0n,
      },
      orderType: params.orderType ?? OrderType.MarketIncrease,
      decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
      isLong: params.isLong,
      shouldUnwrapNativeToken: false,
      autoCancel: false,
      referralCode: params.referralCode ?? ZERO_BYTES32,
    };

    // 限价单必须提供 triggerPrice
    if (orderParams.orderType === OrderType.LimitIncrease && !params.triggerPrice) {
      throw new SDKError("LimitIncrease order requires triggerPrice");
    }

    const multicallData = this.buildOpenMulticall(
      params.executionFee,
      params.collateralToken,
      params.collateralAmount,
      orderParams
    );

    return this.sendAndConfirm(async () => {
      const nonce = await this.getNonce();
      const gasLimit = await this.estimateGasWithBuffer(multicallData, params.executionFee);
      return this.exchangeRouter.multicall(multicallData, {
        value: params.executionFee,
        nonce,
        gasLimit,
      });
    }, "openPosition");
  }

  /**
   * 平仓 - 创建 MarketDecrease 订单
   *
   * 流程: multicall([sendWnt, createOrder])
   * 返回 OrderResult, 包含交易回执和解析后的日志
   */
  async closePosition(params: ClosePositionParams): Promise<OrderResult> {
    const account = await this.signer.getAddress();

    const orderParams: CreateOrderParams = {
      addresses: {
        receiver: account,
        cancellationReceiver: account,
        callbackContract: ZERO_ADDRESS,
        uiFeeReceiver: ZERO_ADDRESS,
        market: params.market,
        initialCollateralToken: params.collateralToken,
        swapPath: params.swapPath ?? [],
      },
      numbers: {
        sizeDeltaUsd: params.sizeDeltaUsd,
        initialCollateralDeltaAmount: params.initialCollateralDeltaAmount ?? 0n,
        triggerPrice: params.triggerPrice ?? 0n,
        acceptablePrice: params.acceptablePrice,
        executionFee: params.executionFee,
        callbackGasLimit: 0n,
        minOutputAmount: params.minOutputAmount ?? 0n,
      },
      orderType: params.orderType ?? OrderType.MarketDecrease,
      decreasePositionSwapType:
        params.decreasePositionSwapType ?? DecreasePositionSwapType.NoSwap,
      isLong: params.isLong,
      shouldUnwrapNativeToken: false,
      autoCancel: false,
      referralCode: params.referralCode ?? ZERO_BYTES32,
    };

    // 限价/止损单必须提供 triggerPrice
    const needsTrigger = orderParams.orderType === OrderType.LimitDecrease
      || orderParams.orderType === OrderType.StopLossDecrease;
    if (needsTrigger && !params.triggerPrice) {
      throw new SDKError("LimitDecrease/StopLossDecrease order requires triggerPrice");
    }

    const multicallData = this.buildCloseMulticall(
      params.executionFee,
      orderParams
    );

    return this.sendAndConfirm(async () => {
      const nonce = await this.getNonce();
      const gasLimit = await this.estimateGasWithBuffer(multicallData, params.executionFee);
      return this.exchangeRouter.multicall(multicallData, {
        value: params.executionFee,
        nonce,
        gasLimit,
      });
    }, "closePosition");
  }

  /**
   * 估算 gasLimit 并加 20% buffer，防止 out of gas
   */
  private async estimateGasWithBuffer(
    multicallData: string[],
    value: bigint
  ): Promise<bigint> {
    try {
      const estimated = await this.exchangeRouter.multicall.estimateGas(
        multicallData,
        { value }
      );
      return (estimated * 120n) / 100n; // +20% buffer
    } catch {
      return 3_000_000n; // 估算失败时使用默认值
    }
  }

  /**
   * 获取当前 pending nonce，防止并发交易冲突
   */
  private async getNonce(): Promise<number> {
    const address = await this.signer.getAddress();
    const provider = this.signer.provider;
    if (!provider) throw new SDKError("No provider available");
    return provider.getTransactionCount(address, "pending");
  }

  /**
   * 发送交易并等待确认, 统一的错误处理
   * - 自动获取 pending nonce
   * - 自动估算 gasLimit (加 20% buffer)
   */
  private async sendAndConfirm(
    txFn: () => Promise<ethers.TransactionResponse>,
    operation: string
  ): Promise<OrderResult> {
    let tx: ethers.TransactionResponse;

    // 发送交易（含 nonce 管理）
    try {
      tx = await txFn();
    } catch (err: unknown) {
      const revertReason = this.parseRevertReason(err);
      throw new SDKError(
        `${operation} failed to send transaction: ${revertReason || (err instanceof Error ? err.message : String(err))}`,
        { cause: err, revertReason: revertReason || undefined }
      );
    }

    // 等待确认
    try {
      const receipt = await Promise.race([
        tx.wait(this.confirmations),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Transaction confirmation timeout")), this.txTimeout)
        ),
      ]);

      if (!receipt) {
        throw new SDKError(`${operation} transaction returned null receipt`, { txHash: tx.hash });
      }

      if (receipt.status === 0) {
        throw new SDKError(`${operation} transaction reverted`, {
          txHash: tx.hash,
          revertReason: "Transaction reverted on-chain",
        });
      }

      return {
        hash: tx.hash,
        receipt,
        logs: receipt.logs as ethers.Log[],
      };
    } catch (err: unknown) {
      if (err instanceof SDKError) throw err;
      const revertReason = this.parseRevertReason(err);
      throw new SDKError(
        `${operation} failed during confirmation: ${revertReason || (err instanceof Error ? err.message : String(err))}`,
        { cause: err, txHash: tx.hash, revertReason: revertReason || undefined }
      );
    }
  }

  /**
   * 从错误中解析 revert reason
   */
  private parseRevertReason(err: unknown): string | null {
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      // ethers v6 format
      if (typeof e.reason === "string") return e.reason;
      if (typeof e.shortMessage === "string") return e.shortMessage;
      // nested revert data
      if (e.data && typeof e.data === "string") {
        try {
          return ethers.toUtf8String("0x" + (e.data as string).slice(138));
        } catch {
          return e.data as string;
        }
      }
    }
    return null;
  }

  /**
   * 构建开仓的 multicall 数据
   * [sendWnt(orderVault, executionFee), sendTokens(token, orderVault, amount), createOrder(params)]
   */
  private buildOpenMulticall(
    executionFee: bigint,
    collateralToken: string,
    collateralAmount: bigint,
    orderParams: CreateOrderParams
  ): string[] {
    const iface = this.exchangeRouter.interface;

    const sendWntData = iface.encodeFunctionData("sendWnt", [
      this.contracts.orderVault,
      executionFee,
    ]);

    const sendTokensData = iface.encodeFunctionData("sendTokens", [
      collateralToken,
      this.contracts.orderVault,
      collateralAmount,
    ]);

    const createOrderData = iface.encodeFunctionData("createOrder", [
      this.toContractOrderParams(orderParams),
    ]);

    return [sendWntData, sendTokensData, createOrderData];
  }

  /**
   * 构建平仓的 multicall 数据
   * [sendWnt(orderVault, executionFee), createOrder(params)]
   */
  private buildCloseMulticall(
    executionFee: bigint,
    orderParams: CreateOrderParams
  ): string[] {
    const iface = this.exchangeRouter.interface;

    const sendWntData = iface.encodeFunctionData("sendWnt", [
      this.contracts.orderVault,
      executionFee,
    ]);

    const createOrderData = iface.encodeFunctionData("createOrder", [
      this.toContractOrderParams(orderParams),
    ]);

    return [sendWntData, createOrderData];
  }

  /**
   * 将 SDK 参数格式转为合约 tuple 格式
   */
  private toContractOrderParams(params: CreateOrderParams) {
    return {
      addresses: {
        receiver: params.addresses.receiver,
        cancellationReceiver: params.addresses.cancellationReceiver,
        callbackContract: params.addresses.callbackContract,
        uiFeeReceiver: params.addresses.uiFeeReceiver,
        market: params.addresses.market,
        initialCollateralToken: params.addresses.initialCollateralToken,
        swapPath: params.addresses.swapPath,
      },
      numbers: {
        sizeDeltaUsd: params.numbers.sizeDeltaUsd,
        initialCollateralDeltaAmount:
          params.numbers.initialCollateralDeltaAmount,
        triggerPrice: params.numbers.triggerPrice,
        acceptablePrice: params.numbers.acceptablePrice,
        executionFee: params.numbers.executionFee,
        callbackGasLimit: params.numbers.callbackGasLimit,
        minOutputAmount: params.numbers.minOutputAmount,
      },
      orderType: params.orderType,
      decreasePositionSwapType: params.decreasePositionSwapType,
      isLong: params.isLong,
      shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
      autoCancel: params.autoCancel,
      referralCode: params.referralCode,
    };
  }

  /** 获取合约地址配置 */
  getContracts(): ContractAddresses {
    return { ...this.contracts };
  }

  /** 获取当前签名者地址 */
  async getAddress(): Promise<string> {
    return this.signer.getAddress();
  }
}
