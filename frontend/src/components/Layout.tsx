import React from 'react';
import { Activity, Dumbbell, ShieldCheck } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 text-white p-2 rounded-xl shadow-md shadow-blue-200 flex items-center justify-center">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-tight tracking-tight text-slate-900">LiftSync</h1>
            <p className="text-xs text-slate-500 font-medium">Form Degradation Tracker</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 bg-slate-100/80 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-600">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Real-time IMU Engine</span>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 w-full max-w-lg mx-auto p-4 md:p-6 flex flex-col space-y-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-4 text-center mt-auto">
        <div className="max-w-lg mx-auto px-4 flex items-center justify-between text-xs font-medium text-slate-400">
          <span>LiftSync PWA v1.0.0</span>
          <div className="flex items-center space-x-1">
            <Activity className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
            <span>100 Hz Sampling Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default Layout;
