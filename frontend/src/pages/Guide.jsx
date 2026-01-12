import Header from '../components/Header';
import Footer from '../components/Footer';

export default function Guide() {
  return (
    <>
      <Header />
      <div className="min-h-screen py-6 sm:py-12 px-4 sm:px-6 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto">
          
          {/* Hero */}
          <div className="text-center mb-10 sm:mb-16">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-equorum-dark mb-4">
              How to Use Revenue Bonds
            </h1>
            <p className="text-base sm:text-xl text-gray-600">
              A step-by-step guide to connect, view, and claim your revenue
            </p>
          </div>

          {/* Step 1 */}
          <div className="mb-10 sm:mb-16">
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-equorum-orange to-equorum-accent flex items-center justify-center text-white font-bold text-lg sm:text-xl">
                1
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-equorum-dark">Connect Your Wallet</h2>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
              <div className="bg-gray-100 rounded-xl p-6 sm:p-8 mb-6 text-center">
                <div className="inline-block">
                  <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-equorum-dark mb-4">Revenue Bonds</h3>
                  <p className="text-sm sm:text-base text-gray-600 mb-6">Connect your wallet to view and claim revenue</p>
                  <div className="inline-block px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-equorum-orange to-equorum-accent text-white rounded-xl font-bold text-lg sm:text-xl">
                    Connect Wallet
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    Click the <strong>"Connect Wallet"</strong> button to connect your MetaMask or WalletConnect
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    Make sure you're on <strong>Arbitrum One</strong> or <strong>Arbitrum Sepolia</strong> network
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    After connecting, you'll see your wallet address and ETH balance
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="mb-10 sm:mb-16">
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-equorum-orange to-equorum-accent flex items-center justify-center text-white font-bold text-lg sm:text-xl">
                2
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-equorum-dark">Load Revenue Series</h2>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
              <div className="bg-gray-100 rounded-xl p-4 sm:p-6 mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-equorum-dark mb-4">Load Revenue Series</h3>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paste Revenue Series Address
                </label>
                <div className="bg-white border-2 border-equorum-orange rounded-xl px-4 py-3 font-mono text-sm text-gray-600 mb-4">
                  0xb42751FFBCFbe76dd5Fc919088B2a81B52C48D19
                </div>
                <div className="bg-gray-300 text-gray-500 text-center py-3 rounded-xl font-bold">
                  Load Series
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    Paste the <strong>Revenue Series contract address</strong> you want to view
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    The address is provided by the protocol that issued the revenue bonds
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    Click <strong>"Load Series"</strong> to fetch on-chain data
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="mb-10 sm:mb-16">
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-equorum-orange to-equorum-accent flex items-center justify-center text-white font-bold text-lg sm:text-xl">
                3
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-equorum-dark">View Series Information</h2>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
              <div className="bg-gray-100 rounded-xl p-4 sm:p-6 mb-6">
                <h3 className="text-2xl sm:text-3xl font-bold text-equorum-dark mb-2">Demo Revenue Series</h3>
                <p className="text-gray-600 font-mono text-sm mb-4">DEMO-REV</p>
                
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl mb-6">
                  <span className="text-sm font-medium text-gray-600">Lifetime Revenue Paid</span>
                  <span className="text-2xl font-bold text-green-600">0.01048 ETH</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-gray-500 mb-1">Status</p>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full font-medium bg-green-100 text-green-700">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      Active
                    </span>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Matures</p>
                    <p className="font-medium text-gray-900">09/01/2027</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Revenue Share to Holders</p>
                    <p className="font-medium text-gray-900">20%</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Total Supply</p>
                    <p className="font-medium text-gray-900">1,000,000 tokens</p>
                  </div>
                </div>
                
                <div className="border-t border-gray-300 pt-4">
                  <p className="text-xs text-gray-500 mb-2 font-medium">Verified Contracts</p>
                  <div className="flex flex-wrap gap-2">
                    <div className="px-3 py-1.5 bg-gray-200 rounded-lg text-xs font-medium text-gray-700">
                      Series Contract ↗
                    </div>
                    <div className="px-3 py-1.5 bg-gray-200 rounded-lg text-xs font-medium text-gray-700">
                      Router Contract ↗
                    </div>
                    <div className="px-3 py-1.5 bg-gray-200 rounded-lg text-xs font-medium text-gray-700">
                      Protocol Address ↗
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    <strong>Lifetime Revenue Paid:</strong> Total ETH distributed to all holders since inception
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    <strong>Status:</strong> Active means the series is still distributing revenue
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    <strong>Revenue Share:</strong> Percentage of protocol revenue that goes to bond holders
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    <strong>Verified Contracts:</strong> Click to view contracts on Arbiscan for transparency
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="mb-10 sm:mb-16">
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-equorum-orange to-equorum-accent flex items-center justify-center text-white font-bold text-lg sm:text-xl">
                4
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-equorum-dark">View Your Position & Claim</h2>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
              <div className="bg-gradient-to-br from-equorum-orange/5 to-equorum-accent/5 rounded-xl p-4 sm:p-6 border-2 border-equorum-orange/20 mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-equorum-dark mb-4 sm:mb-6">Your Position</h3>
                
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Your balance</span>
                    <span className="font-bold text-lg text-gray-900">1,000,000 DEMO-REV</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Your ownership</span>
                    <span className="font-bold text-lg text-gray-900">100.00%</span>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-600">Total revenue received by series</span>
                      <span className="font-medium text-gray-900">0.01048 ETH</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-semibold">Your claimable</span>
                      <span className="font-bold text-3xl text-green-600">0.00488 ETH</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-equorum-orange to-equorum-accent text-white text-center py-4 rounded-xl font-bold text-xl">
                  Claim 0.00488 ETH
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    <strong>Your balance:</strong> Number of revenue bond tokens you hold
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    <strong>Your ownership:</strong> Your percentage of the total supply
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    <strong>Your claimable:</strong> ETH ready to be claimed right now (shown in green)
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-equorum-orange font-bold">→</span>
                  <p className="text-gray-700">
                    Click <strong>"Claim"</strong> to withdraw your revenue to your wallet
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="bg-gradient-to-r from-equorum-orange/10 to-equorum-accent/10 rounded-2xl p-6 sm:p-8 border-2 border-equorum-orange/20">
            <h2 className="text-xl sm:text-2xl font-bold text-equorum-dark mb-4">📊 Additional Features</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-equorum-orange font-bold text-xl">•</span>
                <p className="text-gray-700">
                  <strong>Revenue Distribution Chart:</strong> Visual graph showing revenue received over time
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-equorum-orange font-bold text-xl">•</span>
                <p className="text-gray-700">
                  <strong>Transaction History:</strong> Complete list of all revenue events with timestamps and Arbiscan links
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-equorum-orange font-bold text-xl">•</span>
                <p className="text-gray-700">
                  <strong>Gas Estimates:</strong> See transaction costs before claiming
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-equorum-orange font-bold text-xl">•</span>
                <p className="text-gray-700">
                  <strong>Real-time Updates:</strong> All data is fetched directly from the blockchain
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-10 sm:mt-16">
            <a
              href="/"
              className="inline-block px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-equorum-orange to-equorum-accent text-white rounded-xl font-bold text-lg sm:text-xl hover:shadow-lg transition-all"
            >
              Start Using Revenue Bonds →
            </a>
          </div>

        </div>
      </div>
      <Footer />
    </>
  );
}
