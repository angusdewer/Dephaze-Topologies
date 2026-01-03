import React, { useState } from 'react';
import DephazeValidation from './DephazeValidation';
import DephazeViewer from './DephazeViewer';
import DephazeAnisotropicMapping from './DephazeAnisotropicMapping';

function App() {
  const [tab, setTab] = useState('viewer');

  const tabs = [
    { id: 'viewer', label: '3D INTERACTIVE VIEWER', icon: '🌀' },
    { id: 'validation', label: 'CORE VALIDATION', icon: '📐' },
    { id: 'anisotropic', label: 'ANISOTROPIC MAPPING', icon: '🌌' }
  ];

  return (
    <div className="bg-[#0f172a] min-h-screen text-white font-sans">
      {/* Navigation Header */}
      <nav className="bg-[#1e293b] border-b border-slate-700 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between py-4 gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌀</span>
              <span className="text-xl font-black tracking-tighter bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                DEPHAZE PROTOCOL v6.3
              </span>
            </div>
            
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                    tab === t.id
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="animate-in fade-in duration-500">
        {tab === 'viewer' && <DephazeViewer />}
        {tab === 'validation' && <DephazeValidation />}
        {tab === 'anisotropic' && <DephazeAnisotropicMapping />}
      </main>

      {/* Footer Branding */}
      <footer className="py-8 text-center border-t border-slate-800 opacity-50 text-xs tracking-widest uppercase">
        © 2026 DEPHAZE RESEARCH | LEAD DEVELOPER: ANGUS | COORDINATE-FREE GEOMETRY
      </footer>
    </div>
  );
}

export default App;
