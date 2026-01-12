import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { formatEther } from 'viem';
import { SERIES_ABI } from '../config/contracts';

export default function ClaimButton({ seriesAddress, claimable }) {
  const chainId = useChainId();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  
  const handleClaim = () => {
    writeContract({
      address: seriesAddress,
      abi: SERIES_ABI,
      functionName: 'claimRevenue',
    });
  };
  
  const isDisabled = claimable === 0n || isPending || isConfirming;
  const explorerBase = chainId === 421614 ? 'https://sepolia.arbiscan.io' : 'https://arbiscan.io';
  
  return (
    <div className="space-y-3">
      <button
        onClick={handleClaim}
        disabled={isDisabled}
        className={`w-full px-6 py-4 rounded-xl font-bold text-lg transition-all duration-200 ${
          isDisabled
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-equorum-orange to-equorum-accent text-white hover:shadow-lg hover:scale-[1.02] shadow-md'
        }`}
      >
        {isPending && '⏳ Confirm in wallet...'}
        {isConfirming && '⏳ Claiming...'}
        {isSuccess && '✅ Claimed!'}
        {!isPending && !isConfirming && !isSuccess && (
          claimable === 0n ? 'No revenue to claim' : `Claim ${formatEther(claimable)} ETH`
        )}
      </button>
      
      {isSuccess && hash && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium mb-2">✅ Successfully claimed {formatEther(claimable)} ETH</p>
          <a
            href={`${explorerBase}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:text-green-700 text-sm font-medium underline"
          >
            View transaction on Arbiscan →
          </a>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium text-sm">
            ❌ Error: {error.message?.slice(0, 100) || 'Transaction failed'}
          </p>
        </div>
      )}
    </div>
  );
}
