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
} from "./types";

export class UpdownSDK {
  private signer: Signer;
  private contracts: ContractAddresses;
  private exchangeRouter: Contract;

  constructor(signer: Signer, config?: UpdownConfig) {
    this.signer = signer;
    this.contracts = { ...DEFAULT_CONTRACTS, ...config?.contracts };
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
   */
  async openPosition(
    params: OpenPositionParams
  ): Promise<ethers.TransactionResponse> {
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
        triggerPrice: 0n,
        acceptablePrice: params.acceptablePrice,
        executionFee: params.executionFee,
        callbackGasLimit: 0n,
        minOutputAmount: 0n,
      },
      orderType: OrderType.MarketIncrease,
      decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
      isLong: params.isLong,
      shouldUnwrapNativeToken: false,
      autoCancel: false,
      referralCode: params.referralCode ?? ZERO_BYTES32,
    };

    const multicallData = this.buildOpenMulticall(
      params.executionFee,
      params.collateralToken,
      params.collateralAmount,
      orderParams
    );

    return this.exchangeRouter.multicall(multicallData, {
      value: params.executionFee,
    });
  }

  /**
   * 平仓 - 创建 MarketDecrease 订单
   *
   * 流程: multicall([sendWnt, createOrder])
   */
  async closePosition(
    params: ClosePositionParams
  ): Promise<ethers.TransactionResponse> {
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
        triggerPrice: 0n,
        acceptablePrice: params.acceptablePrice,
        executionFee: params.executionFee,
        callbackGasLimit: 0n,
        minOutputAmount: params.minOutputAmount ?? 0n,
      },
      orderType: OrderType.MarketDecrease,
      decreasePositionSwapType:
        params.decreasePositionSwapType ?? DecreasePositionSwapType.NoSwap,
      isLong: params.isLong,
      shouldUnwrapNativeToken: false,
      autoCancel: false,
      referralCode: params.referralCode ?? ZERO_BYTES32,
    };

    const multicallData = this.buildCloseMulticall(
      params.executionFee,
      orderParams
    );

    return this.exchangeRouter.multicall(multicallData, {
      value: params.executionFee,
    });
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
