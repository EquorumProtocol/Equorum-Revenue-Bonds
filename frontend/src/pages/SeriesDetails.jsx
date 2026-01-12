import { useParams, Link } from 'react-router-dom';
import { useReadContract, useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { SERIES_ABI } from '../config/contracts';
import ClaimButton from '../components/ClaimButton';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function SeriesDetails() {
  const { address } = useParams();
  const { address: userAddress } = useAccount();
  
  const { data: name } = useReadContract({
    address,
    abi: SERIES_ABI,
    functionName: 'name',
  });
  
  const { data: symbol } = useReadContract({
    address,
    abi: SERIES_ABI,
    functionName: 'symbol',
  });
  
  const { data: info } = useReadContract({
    address,
    abi: SERIES_ABI,
    functionName: 'getSeriesInfo',
  });
  
  const { data: balance } = useReadContract({
    address,
    abi: SERIES_ABI,
    functionName: 'balanceOf',
    args: [userAddress],
    query: { enabled: !!userAddress },
  });
  
  const { data: claimable } = useReadContract({
    address,
    abi: SERIES_ABI,
    functionName: 'calculateClaimable',
    args: [userAddress],
    query: { enabled: !!userAddress },
  });
  
  const { data: totalSupply } = useReadContract({
    address,
    abi: SERIES_ABI,
    functionName: 'totalSupply',
  });
  
  const { data: revenuePerToken } = useReadContract({
    address,
    abi: SERIES_ABI,
    functionName: 'revenuePerTokenStored',
  });
  
  const [protocol, router, revenueShareBPS, maturityDate, totalRevenueReceived, active] = info || [];
  
  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6">
          <Link to="/" className="text-equorum-orange hover:text-equorum-accent mb-6 inline-block font-medium">
            ← Back to My Revenue
          </Link>
          
          <h1 className="text-3xl font-bold text-equorum-dark mb-2">{name || 'Loading...'}</h1>
          <p className="text-muted mb-8">{symbol}</p>
        
        {/* User Position */}
        {userAddress && balance > 0n && (
          <div className="bg-white border border-gray-200 p-6 rounded-lg shadow-sm mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Position</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-muted">Holdings</p>
                <p className="font-medium text-gray-900">
                  {Number(formatEther(balance)).toLocaleString()} tokens
                </p>
              </div>
              <div>
                <p className="text-sm text-muted">Available to Claim</p>
                <p className="font-bold text-lg text-gray-900">
                  {formatEther(claimable || 0n)} ETH
                </p>
              </div>
            </div>
            <ClaimButton seriesAddress={address} claimable={claimable || 0n} />
          </div>
        )}
        
        {/* Series Info */}
        <div className="bg-white border border-gray-200 p-6 rounded-lg shadow-sm mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Series Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted">Total Supply</p>
              <p className="font-medium text-gray-900">
                {Number(formatEther(totalSupply || 0n)).toLocaleString()} tokens
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Revenue Share</p>
              <p className="font-medium text-gray-900">
                {revenueShareBPS ? Number(revenueShareBPS) / 100 : 0}% to holders
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Maturity Date</p>
              <p className="font-medium text-gray-900">
                {maturityDate ? new Date(Number(maturityDate) * 1000).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Status</p>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                active 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {active ? 'Active' : 'Matured'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Revenue Stats */}
        <div className="bg-white border border-gray-200 p-6 rounded-lg shadow-sm mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Revenue Stats</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted">Total Distributed</p>
              <p className="font-medium text-gray-900">
                {formatEther(totalRevenueReceived || 0n)} ETH
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Revenue per Token</p>
              <p className="font-medium text-gray-900">
                {revenuePerToken ? Number(formatEther(revenuePerToken)).toFixed(9) : '0'} ETH
              </p>
            </div>
          </div>
        </div>
        
        {/* Contract Addresses */}
        <div className="bg-white border border-gray-200 p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Contract Addresses</h2>
          <div className="space-y-3 font-mono text-sm">
            <div>
              <p className="text-muted mb-1">Series</p>
              <a 
                href={`https://arbiscan.io/address/${address}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {address}
              </a>
            </div>
            <div>
              <p className="text-muted mb-1">Router</p>
              <a 
                href={`https://arbiscan.io/address/${router}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {router || 'N/A'}
              </a>
            </div>
            <div>
              <p className="text-muted mb-1">Protocol</p>
              <a 
                href={`https://arbiscan.io/address/${protocol}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {protocol || 'N/A'}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
    <Footer />
    </>
  );
}
