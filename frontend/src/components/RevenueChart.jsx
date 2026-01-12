import { useMemo } from 'react';
import { formatEther } from 'viem';

export default function RevenueChart({ events }) {
  // Aggregate revenue by date
  const chartData = useMemo(() => {
    if (!events || events.length === 0) return [];
    
    const dailyRevenue = {};
    
    events.forEach(event => {
      if (event.type === 'routed' && event.toSeries) {
        const date = new Date(event.timestamp * 1000);
        const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        if (!dailyRevenue[dateKey]) {
          dailyRevenue[dateKey] = {
            date: dateKey,
            timestamp: event.timestamp,
            amount: 0n
          };
        }
        
        dailyRevenue[dateKey].amount += event.toSeries;
      }
    });
    
    // Convert to array and sort by timestamp
    return Object.values(dailyRevenue)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-7); // Last 7 days
  }, [events]);
  
  if (chartData.length === 0) {
    return null;
  }
  
  // Find max value for scaling
  const maxAmount = chartData.reduce((max, item) => {
    const amount = Number(formatEther(item.amount));
    return amount > max ? amount : max;
  }, 0);
  
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
      <h2 className="text-2xl font-bold text-equorum-dark mb-6">Revenue Distribution</h2>
      
      <div className="space-y-3">
        {chartData.map((item, index) => {
          const amount = Number(formatEther(item.amount));
          const percentage = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
          
          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{item.date}</span>
                <span className="font-bold text-green-600">{amount.toFixed(6)} ETH</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Summary */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Total (Last 7 Days)</span>
          <span className="text-lg font-bold text-equorum-dark">
            {chartData.reduce((sum, item) => sum + Number(formatEther(item.amount)), 0).toFixed(6)} ETH
          </span>
        </div>
      </div>
    </div>
  );
}
