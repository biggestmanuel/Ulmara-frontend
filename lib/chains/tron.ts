// tronweb does not currently ship TypeScript declarations.
// @ts-expect-error Missing declaration file for the tronweb package.
import TronWeb from 'tronweb';

const rpcUrl = process.env.EXPO_PUBLIC_RPC_TRON ?? '';

export const tronConfig = {
  id: 'tron',
  label: 'TRON',
  nativeSymbol: 'TRX',
  decimals: 6,
};

let tronWeb: any = null;
export function getTronWeb() {
  if (!tronWeb) {
    tronWeb = new TronWeb({ fullHost: rpcUrl });
  }
  return tronWeb;
}

export async function getBalance(address: string): Promise<string> {
  const tw = getTronWeb();
  const sun = await tw.trx.getBalance(address);
  return tw.fromSun(sun).toString();
}

export function isValidAddress(address: string): boolean {
  try {
    return getTronWeb().isAddress(address);
  } catch {
    return false;
  }
}

// TRON fees are bandwidth/energy based rather than a flat gas price;
// this returns a rough TRX-denominated estimate for a simple transfer.
export async function estimateGasFee(): Promise<string> {
  return '1'; // placeholder flat estimate, refine once bandwidth model is wired up
}
