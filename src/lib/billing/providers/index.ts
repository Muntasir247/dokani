import { PaymentProvider, PaymentProviderName } from "./types";
import { SslCommerzProvider } from "./sslcommerz";
import { BkashProvider } from "./bkash";

export * from "./types";
export * from "./sslcommerz";
export * from "./bkash";

const sslcommerzInstance = new SslCommerzProvider();
const bkashInstance = new BkashProvider();

export function getPaymentProvider(name: PaymentProviderName = "sslcommerz"): PaymentProvider {
  switch (name) {
    case "bkash":
      return bkashInstance;
    case "sslcommerz":
    default:
      return sslcommerzInstance;
  }
}
