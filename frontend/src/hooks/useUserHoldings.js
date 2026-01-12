import { useReadContracts } from 'wagmi';
import { SERIES_ABI } from '../config/contracts';

export function useUserHoldings(userAddress, allSeries) {
  // Create array of contract calls for each series
  const contracts = allSeries?.flatMap(seriesAddress => [
    {
      address: seriesAddress,
      abi: SERIES_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    },
    {
      address: seriesAddress,
      abi: SERIES_ABI,
      functionName: 'calculateClaimable',
      args: [userAddress],
    },
    {
      address: seriesAddress,
      abi: SERIES_ABI,
      functionName: 'name',
    },
    {
      address: seriesAddress,
      abi: SERIES_ABI,
      functionName: 'symbol',
    },
    {
      address: seriesAddress,
      abi: SERIES_ABI,
      functionName: 'getSeriesInfo',
    },
  ]) || [];

  const { data, isLoading, isError } = useReadContracts({
    contracts,
    query: {
      enabled: !!userAddress && !!allSeries && allSeries.length > 0,
    },
  });

  if (!data || !allSeries) return { data: [], isLoading, isError };

  // Process results and filter only series where user has balance
  const holdings = [];
  for (let i = 0; i < allSeries.length; i++) {
    const baseIndex = i * 5;
    const balance = data[baseIndex]?.result || 0n;
    
    // Only include series where user has tokens
    if (balance > 0n) {
      holdings.push({
        address: allSeries[i],
        balance,
        claimable: data[baseIndex + 1]?.result || 0n,
        name: data[baseIndex + 2]?.result || 'Unknown',
        symbol: data[baseIndex + 3]?.result || 'UNKNOWN',
        info: data[baseIndex + 4]?.result || [],
      });
    }
  }

  return { data: holdings, isLoading, isError };
}
