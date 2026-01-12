import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther, isAddress } from 'viem';
import { SERIES_ABI } from '../config/contracts';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ConnectButton from '../components/ConnectButton';
import ClaimButton from '../components/ClaimButton';
import SeriesHistory from '../components/SeriesHistory';

export default function SimpleClaim() {
  const { address: userAddress, isConnected, chain } = useAccount();
  const [seriesAddress, setSeriesAddress] = useState('');
  const [loadedAddress, setLoadedAddress] = useState(null);
  
  // Series data
  const { data: name } = useReadContract({
    address: loadedAddress,
    abi: SERIES_ABI,
    functionName: 'name',
    query: { enabled: !!loadedAddress },
  });
  
  const { data: symbol } = useReadContract({
    address: loadedAddress,
    abi: SERIES_ABI,
    functionName: 'symbol',
    query: { enabled: !!loadedAddress },
  });
  
  const { data: info } = useReadContract({
    address: loadedAddress,
    abi: SERIES_ABI,
    functionName: 'getSeriesInfo',
    query: { enabled: !!loadedAddress },
  });
  
  const { data: totalSupply } = useReadContract({
    address: loadedAddress,
    abi: SERIES_ABI,
    functionName: 'totalSupply',
    query: { enabled: !!loadedAddress },
  });
  
  const { data: balance } = useReadContract({
    address: loadedAddress,
    abi: SERIES_ABI,
    functionName: 'balanceOf',
    args: [userAddress],
    query: { enabled: !!loadedAddress && !!userAddress },
  });
  
  const { data: claimable } = useReadContract({
    address: loadedAddress,
    abi: SERIES_ABI,
    functionName: 'calculateClaimable',
    args: [userAddress],
    query: { enabled: !!loadedAddress && !!userAddress },
  });
  
  // getSeriesInfo returns: protocol, revenueBPS, maturity, totalRevenue, revenuePerToken, isActive, timeRemaining
  const protocol = info?.[0];
  const revenueShareBPS = info?.[1];
  const maturityDate = info?.[2];
  const totalRevenueReceived = info?.[3];
  const revenuePerToken = info?.[4];
  const active = info?.[5];
  const timeRemaining = info?.[6];
  
  // Get router from series contract
  const { data: router } = useReadContract({
    address: loadedAddress,
    abi: SERIES_ABI,
    functionName: 'router',
    query: { enabled: !!loadedAddress },
  });
  
  const handleLoadSeries = () => {
    if (isAddress(seriesAddress)) {
      setLoadedAddress(seriesAddress);
    }
  };
  
  const ownership = balance && totalSupply ? (Number(balance) / Number(totalSupply) * 100).toFixed(2) : '0';
  const explorerBase = chain?.id === 421614 ? 'https://sepolia.arbiscan.io' : 'https://arbiscan.io';
  
  return (
    <>
      <Header />
      <div className="min-h-screen py-4 sm:py-8 px-4 sm:px-6 bg-gradient-to-br from-orange-100/50 via-orange-50/30 to-red-50/40 relative overflow-hidden">
        {/* Dot Pattern Background */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, rgb(249, 115, 22) 2px, transparent 0)`,
            backgroundSize: '40px 40px'
          }}></div>
        </div>
        
        {/* Floating Orbs Background */}
        <div className="absolute -top-20 -left-20 w-[500px] h-[500px] bg-gradient-to-br from-orange-300/40 to-orange-400/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-20 -right-20 w-[700px] h-[700px] bg-gradient-to-br from-orange-400/35 to-red-400/25 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-gradient-to-br from-orange-200/30 to-orange-300/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }}></div>
        <div className="absolute top-1/4 right-1/3 w-64 h-64 bg-gradient-to-br from-orange-100/25 to-transparent rounded-full blur-2xl"></div>
        
        <div className="max-w-3xl mx-auto relative z-10">
          
          {/* Connect Wallet */}
          {!isConnected ? (
            <div className="text-center py-12 sm:py-20">
              <h1 className="text-3xl sm:text-4xl font-bold text-equorum-dark mb-4">Revenue Bonds</h1>
              <p className="text-sm sm:text-base text-gray-600 mb-8">Connect your wallet to view and claim revenue</p>
              <ConnectButton />
              {chain && (
                <p className="mt-4 text-sm text-gray-500">
                  Network: {chain.name}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Load Series Input */}
              {!loadedAddress && (
                <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6 sm:mb-8">
                  <h2 className="text-xl sm:text-2xl font-bold text-equorum-dark mb-4 sm:mb-6">Load Revenue Series</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Paste Revenue Series Address
                      </label>
                      <input
                        type="text"
                        value={seriesAddress}
                        onChange={(e) => setSeriesAddress(e.target.value)}
                        placeholder="0xb42751FFBCFbe76dd5Fc919088B2a81B52C48D19"
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-equorum-orange focus:outline-none font-mono text-sm"
                      />
                    </div>
                    <button
                      onClick={handleLoadSeries}
                      disabled={!isAddress(seriesAddress)}
                      className={`w-full py-3 rounded-xl font-bold transition-all ${
                        isAddress(seriesAddress)
                          ? 'bg-gradient-to-r from-equorum-orange to-equorum-accent text-white hover:shadow-lg'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      Load Series
                    </button>
                  </div>
                </div>
              )}
              
              {/* Series Loaded */}
              {loadedAddress && (
                <>
                  {/* Series Overview */}
                  <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
                    <div className="flex items-start justify-between mb-4 sm:mb-6">
                      <div className="flex-1">
                        <h1 className="text-2xl sm:text-3xl font-bold text-equorum-dark mb-2">
                          {name || 'Loading...'}
                        </h1>
                        <p className="text-gray-600 font-mono text-sm mb-4">{symbol}</p>
                        
                        {/* Lifetime Revenue Paid - DESTAQUE */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
                          <span className="text-xs sm:text-sm font-medium text-gray-600">Lifetime Revenue Paid</span>
                          <span className="text-xl sm:text-2xl font-bold text-green-600">
                            {totalRevenueReceived ? formatEther(totalRevenueReceived) : '0'} ETH
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setLoadedAddress(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm mb-6">
                      <div>
                        <p className="text-gray-500 mb-1">Status</p>
                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-medium ${
                          active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                          {active ? 'Active' : 'Matured'}
                        </span>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">Matures</p>
                        <p className="font-medium text-gray-900">
                          {maturityDate ? new Date(Number(maturityDate) * 1000).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">Revenue Share to Holders</p>
                        <p className="font-medium text-gray-900">
                          {revenueShareBPS ? (Number(revenueShareBPS) / 100) : 0}%
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1">Total Supply</p>
                        <p className="font-medium text-gray-900">
                          {totalSupply ? Number(formatEther(totalSupply)).toLocaleString() : '0'} tokens
                        </p>
                      </div>
                    </div>
                    
                    {/* Contract Links */}
                    <div className="border-t border-gray-200 pt-4">
                      <p className="text-xs text-gray-500 mb-2 font-medium">Verified Contracts</p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`${explorerBase}/address/${loadedAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs font-medium text-gray-700 transition-colors"
                        >
                          <span>Series Contract</span>
                          <span>↗</span>
                        </a>
                        {router && (
                          <a
                            href={`${explorerBase}/address/${router}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs font-medium text-gray-700 transition-colors"
                          >
                            <span>Router Contract</span>
                            <span>↗</span>
                          </a>
                        )}
                        {protocol && (
                          <a
                            href={`${explorerBase}/address/${protocol}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs font-medium text-gray-700 transition-colors"
                          >
                            <span>Protocol Address</span>
                            <span>↗</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Your Position - CORAÇÃO DO APP */}
                  <div className="bg-gradient-to-br from-equorum-orange/5 to-equorum-accent/5 rounded-2xl shadow-lg p-6 sm:p-8 mb-6 border-2 border-equorum-orange/20">
                    <h2 className="text-xl sm:text-2xl font-bold text-equorum-dark mb-4 sm:mb-6">Your Position</h2>
                    
                    <div className="space-y-3 sm:space-y-4 mb-6">
                      <div className="flex justify-between items-center">
                        <span className="text-sm sm:text-base text-gray-600">Your balance</span>
                        <span className="font-bold text-base sm:text-lg text-gray-900">
                          {balance ? Number(formatEther(balance)).toLocaleString() : '0'} {symbol}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-sm sm:text-base text-gray-600">Your ownership</span>
                        <span className="font-bold text-base sm:text-lg text-gray-900">{ownership}%</span>
                      </div>
                      
                      <div className="border-t border-gray-200 pt-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs sm:text-sm text-gray-600">Total revenue received by series</span>
                          <span className="font-medium text-sm sm:text-base text-gray-900">
                            {totalRevenueReceived ? formatEther(totalRevenueReceived) : '0'} ETH
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm sm:text-base text-gray-600 font-semibold">Your claimable</span>
                          <span className="font-bold text-2xl sm:text-3xl text-green-600">
                            {claimable ? formatEther(claimable) : '0'} ETH
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <ClaimButton seriesAddress={loadedAddress} claimable={claimable || 0n} />
                  </div>
                  
                  {/* Revenue History */}
                  <SeriesHistory seriesAddress={loadedAddress} routerAddress={router} userAddress={userAddress} />
                </>
              )}
            </>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
