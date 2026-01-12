import { formatEther } from 'viem';
import { Link } from 'react-router-dom';
import ClaimButton from './ClaimButton';

export default function HoldingCard({ holding }) {
  const { address, balance, claimable, name, symbol, info } = holding;
  const [, , , , , active] = info || [];
  
  return (
    <div className="glass-effect p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 border-2 border-white/50 group hover:scale-[1.02] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-equorum-orange/5 to-transparent rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
      
      <div className="relative">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-xl font-bold text-equorum-dark mb-1">{name}</h3>
            <p className="text-sm text-gray-500 font-medium">{symbol}</p>
          </div>
          <span className={`px-4 py-1.5 rounded-full text-xs font-bold shadow-sm ${
            active 
              ? 'bg-gradient-to-r from-green-400 to-green-500 text-white' 
              : 'bg-gray-200 text-gray-600'
          }`}>
            {active ? '● Active' : '○ Matured'}
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-white/50 p-4 rounded-xl">
            <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wide">Your Balance</p>
            <p className="font-bold text-gray-900 text-lg">
              {Number(formatEther(balance)).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">tokens</p>
          </div>
          <div className="bg-gradient-to-br from-equorum-orange/10 to-equorum-accent/10 p-4 rounded-xl border border-equorum-orange/20">
            <p className="text-xs text-equorum-orange mb-2 font-semibold uppercase tracking-wide">Claimable</p>
            <p className="font-bold text-equorum-orange text-lg">
              {formatEther(claimable)}
            </p>
            <p className="text-xs text-equorum-orange/70 mt-1">ETH</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <ClaimButton seriesAddress={address} claimable={claimable} />
          <Link
            to={`/series/${address}`}
            className="flex-1 px-4 py-2.5 bg-white/80 border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-white hover:border-equorum-orange/30 font-semibold text-center transition-all duration-200 hover:shadow-md"
          >
            View Details →
          </Link>
        </div>
      </div>
    </div>
  );
}
