import { Link } from 'react-router-dom';
import ConnectButton from './ConnectButton';

export default function Header() {
  return (
    <header className="bg-gradient-to-r from-equorum-dark via-gray-900 to-equorum-dark sticky top-0 z-50 shadow-lg backdrop-blur-sm bg-opacity-95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex justify-between items-center gap-2 sm:gap-4">
          <Link to="/" className="flex items-center gap-2 sm:gap-4 hover:scale-105 transition-transform duration-200">
            <img 
              src="/equorum-logo-white.svg" 
              alt="Equorum Logo" 
              className="h-12 sm:h-16 md:h-20 drop-shadow-lg"
            />
            <div className="hidden sm:block">
              <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">Equorum</h1>
              <p className="text-xs text-gray-300 tracking-wide">Revenue Bonds Protocol</p>
            </div>
          </Link>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Link 
              to="/guide" 
              className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-equorum-orange to-equorum-accent hover:from-equorum-accent hover:to-equorum-orange text-white rounded-lg font-bold transition-all shadow-md hover:shadow-lg text-sm sm:text-base"
            >
              <span className="hidden sm:inline">�</span>
              <span>Guide</span>
            </Link>
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}
