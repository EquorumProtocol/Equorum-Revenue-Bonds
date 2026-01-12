import { useEffect, useState } from 'react';
import { usePublicClient, useChainId } from 'wagmi';
import { formatEther } from 'viem';
import { SERIES_ABI, ROUTER_ABI } from '../config/contracts';
import RevenueChart from './RevenueChart';

export default function SeriesHistory({ seriesAddress, routerAddress, userAddress }) {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const explorerBase = chainId === 421614 ? 'https://sepolia.arbiscan.io' : 'https://arbiscan.io';
  
  useEffect(() => {
    if (!seriesAddress || !routerAddress || !publicClient) return;
    
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock - 10000n; // Last ~10k blocks
        
        // Fetch router events
        const routerReceivedLogs = await publicClient.getLogs({
          address: routerAddress,
          event: {
            type: 'event',
            name: 'RevenueReceived',
            inputs: [
              { type: 'address', indexed: true, name: 'sender' },
              { type: 'uint256', indexed: false, name: 'amount' },
              { type: 'uint256', indexed: false, name: 'timestamp' }
            ]
          },
          fromBlock,
          toBlock: 'latest'
        });
        
        const routerRoutedLogs = await publicClient.getLogs({
          address: routerAddress,
          event: {
            type: 'event',
            name: 'RevenueRouted',
            inputs: [
              { type: 'uint256', indexed: false, name: 'toSeries' },
              { type: 'uint256', indexed: false, name: 'toProtocol' },
              { type: 'uint256', indexed: false, name: 'timestamp' }
            ]
          },
          fromBlock,
          toBlock: 'latest'
        });
        
        // Fetch series claim events (filtered by user)
        const seriesClaimLogs = userAddress ? await publicClient.getLogs({
          address: seriesAddress,
          event: {
            type: 'event',
            name: 'RevenueClaimed',
            inputs: [
              { type: 'address', indexed: true, name: 'user' },
              { type: 'uint256', indexed: false, name: 'amount' }
            ]
          },
          args: {
            user: userAddress
          },
          fromBlock,
          toBlock: 'latest'
        }) : [];
        
        // Process and combine events
        const allEvents = [];
        
        // Router received events
        for (const log of routerReceivedLogs) {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          allEvents.push({
            type: 'received',
            amount: log.args.amount,
            timestamp: Number(block.timestamp),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber
          });
        }
        
        // Router routed events
        for (const log of routerRoutedLogs) {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          allEvents.push({
            type: 'routed',
            toSeries: log.args.toSeries,
            toProtocol: log.args.toProtocol,
            timestamp: Number(block.timestamp),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber
          });
        }
        
        // User claim events
        for (const log of seriesClaimLogs) {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          allEvents.push({
            type: 'claimed',
            amount: log.args.amount,
            timestamp: Number(block.timestamp),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber
          });
        }
        
        // Sort by timestamp (most recent first)
        allEvents.sort((a, b) => b.timestamp - a.timestamp);
        
        setEvents(allEvents.slice(0, 10)); // Keep only last 10
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEvents();
  }, [seriesAddress, routerAddress, userAddress, publicClient, chainId]);
  
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-equorum-dark mb-6">Revenue History</h2>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-equorum-orange mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading history...</p>
        </div>
      </div>
    );
  }
  
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-equorum-dark mb-6">Revenue History</h2>
        <div className="text-center py-8">
          <p className="text-gray-500">No revenue activity yet</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      {/* Revenue Chart */}
      <RevenueChart events={events} />
      
      {/* Revenue History List */}
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-equorum-dark mb-6">Transaction History</h2>
        <div className="space-y-4">
          {events.map((event, index) => (
          <div key={index} className="border-l-4 border-gray-200 pl-4 py-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">
                  {new Date(event.timestamp * 1000).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                
                {event.type === 'received' && (
                  <p className="font-medium text-gray-900">
                    +{formatEther(event.amount)} ETH received by router
                  </p>
                )}
                
                {event.type === 'routed' && (
                  <div>
                    <p className="font-medium text-gray-900">
                      Revenue routed to series
                    </p>
                    <p className="text-sm text-gray-600">
                      To series: {formatEther(event.toSeries)} ETH • 
                      To protocol: {formatEther(event.toProtocol)} ETH
                    </p>
                  </div>
                )}
                
                {event.type === 'claimed' && (
                  <p className="font-medium text-green-700">
                    ✅ You claimed {formatEther(event.amount)} ETH
                  </p>
                )}
              </div>
              
              <a
                href={`${explorerBase}/tx/${event.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-equorum-orange hover:text-equorum-accent text-sm font-medium"
              >
                Tx →
              </a>
            </div>
          </div>
        ))}
        </div>
      </div>
    </>
  );
}
