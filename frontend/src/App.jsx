import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { config } from './config/wagmi';
import SimpleClaim from './pages/SimpleClaim';
import MyRevenue from './pages/MyRevenue';
import SeriesDetails from './pages/SeriesDetails';
import Guide from './pages/Guide';

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Routes>
            <Route path="/" element={<SimpleClaim />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/my-revenue" element={<MyRevenue />} />
            <Route path="/series/:address" element={<SeriesDetails />} />
          </Routes>
        </Router>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
