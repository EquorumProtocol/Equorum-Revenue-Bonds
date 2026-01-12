import { http, createConfig } from 'wagmi'
import { arbitrum, arbitrumSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [arbitrum, arbitrumSepolia],
  connectors: [injected()],
  transports: {
    [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
    [arbitrumSepolia.id]: http('https://sepolia-rollup.arbitrum.io/rpc'),
  },
})
