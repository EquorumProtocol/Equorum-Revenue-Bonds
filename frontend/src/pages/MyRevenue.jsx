import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { useAllSeries } from '../hooks/useAllSeries';
import { useUserHoldings } from '../hooks/useUserHoldings';
import HoldingCard from '../components/HoldingCard';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ConnectButton from '../components/ConnectButton';

export default function MyRevenue() {
  const { address, isConnected } = useAccount();
  const { data: allSeries, isLoading: seriesLoading } = useAllSeries();
  const { data: holdings, isLoading: holdingsLoading } = useUserHoldings(address, allSeries);
  
  const totalClaimable = holdings?.reduce((sum, h) => sum + h.claimable, 0n) || 0n;
  
  if (!isConnected) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <div className="mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-equorum-orange to-equorum-accent rounded-full mx-auto mb-6 flex items-center justify-center shadow-xl">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-5xl font-bold text-equorum-dark mb-4 tracking-tight">My Revenue</h1>
              <p className="text-lg text-gray-600 mb-8">Connect your wallet to view your holdings and claim revenue</p>
            </div>
            <ConnectButton />
          </div>
        </div>
        <Footer />
      </>
    );
  }
  
  if (seriesLoading || holdingsLoading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="text-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-equorum-orange mx-auto mb-6"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-equorum-orange rounded-full opacity-20 animate-pulse"></div>
              </div>
            </div>
            <p className="text-lg text-gray-600 font-medium">Loading your holdings...</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }
  
  return (
    <>
      <Header />
      <div className="min-h-screen py-8 px-6">
        <div className="max-w-5xl mx-auto">
        
        {/* Total Claimable */}
        <div className="glass-effect p-10 rounded-2xl shadow-2xl mb-10 border-2 border-white/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-equorum-orange/10 to-transparent rounded-full -mr-32 -mt-32"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Claimable Revenue</p>
            </div>
            <p className="text-6xl font-bold bg-gradient-to-r from-equorum-dark to-gray-700 bg-clip-text text-transparent mb-2">{formatEther(totalClaimable)} ETH</p>
            <p className="text-gray-500 text-sm">Available to claim across all series</p>
          </div>
        </div>
        
        {/* Holdings List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold text-equorum-dark">Your Holdings</h2>
            <span className="px-4 py-2 bg-equorum-orange/10 text-equorum-orange rounded-full text-sm font-semibold">
              {holdings?.length || 0} Series
            </span>
          </div>
          
          {holdings && holdings.length > 0 ? (
            holdings.map(holding => (
              <HoldingCard key={holding.address} holding={holding} />
            ))
          ) : (
            <div className="glass-effect p-12 rounded-2xl text-center shadow-lg">
              <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-xl font-semibold text-gray-700 mb-2">No holdings found</p>
              <p className="text-gray-500">
                You don't have any revenue series tokens yet
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    <Footer />
    </>
  );
}
