import { ContractAddresses } from "./types";

export const CELO_CHAIN_ID = 42220;

export const CELO_RPC_URL = "https://forno.celo.org";

export const DEFAULT_CONTRACTS: ContractAddresses = {
  exchangeRouter: "0x20095BB2Fe7C8d25D15d6e5985b29755Ef57EecE",
  router: "0x5C1e75b8425F9B0de50F8aA5846189fe8676e463",
  orderVault: "0x3153298B530048dD4E079cB9156d9A2DFdA9F0Dc",
  dataStore: "0x2808efda9b6c464208d14af22a793ad1725d5836",
  eventEmitter: "0x6db23e3b53958c449b7df6d639a1333ca99eb937",
  referralStorage: "0x2128e99291a77e4de5ce47db8527b6121c86ef6a",
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** 30 位精度, GMX V2 标准 USD 精度 */
export const USD_DECIMALS = 30;
export const PRECISION = 10n ** 30n;
