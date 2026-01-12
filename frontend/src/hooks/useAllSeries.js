import { useReadContract } from 'wagmi';
import { FACTORY_ADDRESS, FACTORY_ABI } from '../config/contracts';

export function useAllSeries() {
  return useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getAllSeries',
    query: {
      enabled: !!FACTORY_ADDRESS,
    },
  });
}
