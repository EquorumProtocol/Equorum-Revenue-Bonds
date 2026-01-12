import { useAccount, useConnect, useDisconnect, useBalance, useChainId } from 'wagmi';
import { formatEther } from 'viem';

export default function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address });

  if (isConnected) {
    const isCorrectNetwork = chainId === 42161 || chainId === 421614;
    const networkName = chainId === 42161 ? 'Arbitrum One' : chainId === 421614 ? 'Arbitrum Sepolia' : chain?.name || 'Unknown Network';
    
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="px-3 sm:px-4 py-2 bg-white/80 backdrop-blur-sm rounded-xl border border-white/50 shadow-sm">
            <div className={`text-xs mb-1 font-medium ${isCorrectNetwork ? 'text-green-600' : 'text-yellow-600'}`}>
              {isCorrectNetwork && '✓ '}{networkName}
            </div>
            <span className="text-xs sm:text-sm font-mono font-semibold text-gray-700">
              {address?.slice(0, 4)}...{address?.slice(-3)}
            </span>
            {balance && (
              <div className="text-xs text-gray-600 mt-1">
                {Number(formatEther(balance.value)).toFixed(3)} ETH
              </div>
            )}
          </div>
          <button
            onClick={() => disconnect()}
            className="px-3 sm:px-4 py-2 bg-white/80 backdrop-blur-sm text-gray-700 rounded-xl hover:bg-white border border-white/50 transition-all font-semibold shadow-sm hover:shadow-md text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Disconnect</span>
            <span className="sm:hidden">✕</span>
          </button>
        </div>
        {!isCorrectNetwork && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 sm:p-3">
            <p className="text-yellow-800 text-xs sm:text-sm font-medium">
              ⚠️ Switch to Arbitrum One or Sepolia
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      className="px-6 py-3 bg-gradient-to-r from-equorum-orange to-equorum-accent text-white rounded-xl hover:shadow-xl transition-all duration-200 font-bold shadow-lg hover:scale-105"
    >
      Connect Wallet
    </button>
  );
}
