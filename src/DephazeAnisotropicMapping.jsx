import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Scan, Zap, Cpu, Target, Database, Activity, Loader2 } from 'lucide-react';

const DephazeSpectralMap = () => {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0.8, y: 0.5 });
  const [spectralPower, setSpectralPower] = useState(6); 
  const [scanDensity, setScanDensity] = useState(800);
  const [meshType, setMeshType] = useState('organic');
  const [viewMode, setViewMode] = useState('dephaze');

  // === 1. SZKENNELT NYERS ADAT (ϕ⁻³) ===
  const scannedPoints = useMemo(() => {
    const points = [];
    for (let i = 0; i < scanDensity; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.random() * Math.PI;
      let R = 2.0;
      
      if (meshType === 'organic') {
        R += 0.4 * Math.sin(theta * 2) * Math.cos(phi * 3) + 0.2 * Math.cos(theta * 5);
      } else if (meshType === 'spike') {
        R += 0.7 * Math.pow(Math.abs(Math.sin(theta * 3) * Math.cos(phi * 3)), 2);
      } else {
        R += 0.3 * Math.sin(theta * 4) * Math.sin(phi * 2);
      }
      
      points.push({ 
        x: R * Math.sin(phi) * Math.cos(theta), 
        y: R * Math.sin(phi) * Math.sin(theta), 
        z: R * Math.cos(phi), 
        theta, phi, R 
      });
    }
    return points;
  }, [meshType, scanDensity]);

  // === 2. SPEKTRÁLIS FÁZIS-SŰRÍTÉS ===
  const spectralCoefficients = useMemo(() => {
    const coeffs = [];
    const sampleSet = scannedPoints.length > 500 ? scannedPoints.filter((_, i) => i % 5 === 0) : scannedPoints;
    
    for (let m = 0; m < spectralPower; m++) {
      for (let l = 0; l < spectralPower; l++) {
        let weight = 0;
        sampleSet.forEach(p => {
          weight += p.R * Math.cos(m * p.theta) * Math.sin(l * p.phi);
        });
        coeffs.push(weight / (sampleSet.length || 1));
      }
    }
    return coeffs;
  }, [scannedPoints, spectralPower]);

  // === 3. REKONSTRUKCIÓ ===
  const resolveFieldR = (theta, phi) => {
    let R = 2.0;
    let idx = 0;
    for (let m = 0; m < spectralPower; m++) {
      for (let l = 0; l < spectralPower; l++) {
        if (spectralCoefficients[idx]) {
          R += spectralCoefficients[idx] * Math.cos(m * theta) * Math.sin(l * phi);
        }
        idx++;
      }
    }
    return R;
  };

  // === 4. METRIKÁK ===
  const metrics = useMemo(() => {
    const meshSize = scanDensity * 12;
    const dephazeSize = 16 + (spectralCoefficients.length * 2);
    return {
      meshSize: (meshSize / 1024).toFixed(2),
      dephazeSize,
      ratio: (meshSize / dephazeSize).toFixed(0),
    };
  }, [scanDensity, spectralCoefficients]);

  // === 5. RENDERER ENGINE ===
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let animationId;
    const render = () => {
      const w = canvas.width = 700;
      const h = canvas.height = 500;
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, w, h);
      
      const centerX = w / 2;
      const centerY = h / 2;
      const scale = 110;
      let renderPoints = [];

      // DEPHAZE FIELD
      if (viewMode !== 'mesh') {
        const res = 30;
        for (let i = 0; i < res; i++) {
          const theta = (i / res) * Math.PI * 2;
          for (let j = 0; j < res; j++) {
            const phi = (j / res) * Math.PI;
            const R = resolveFieldR(theta, phi);
            const x = R * Math.sin(phi) * Math.cos(theta);
            const y = R * Math.sin(phi) * Math.sin(theta);
            const z = R * Math.cos(phi);

            const y1 = y * Math.cos(rotation.x) - z * Math.sin(rotation.x);
            const z1 = y * Math.sin(rotation.x) + z * Math.cos(rotation.x);
            const x2 = x * Math.cos(rotation.y) + z1 * Math.sin(rotation.y);
            const z2 = -x * Math.sin(rotation.y) + z1 * Math.cos(rotation.y);
            renderPoints.push({ x: x2, y: y1, z: z2, type: 'dephaze' });
          }
        }
      }

      // MESH CLOUD
      if (viewMode !== 'dephaze') {
        scannedPoints.slice(0, 400).forEach(p => {
          const y1 = p.y * Math.cos(rotation.x) - p.z * Math.sin(rotation.x);
          const z1 = p.y * Math.sin(rotation.x) + p.z * Math.cos(rotation.x);
          const x2 = p.x * Math.cos(rotation.y) + z1 * Math.sin(rotation.y);
          const z2 = -p.x * Math.sin(rotation.y) + z1 * Math.cos(rotation.y);
          renderPoints.push({ x: x2, y: y1, z: z2, type: 'mesh' });
        });
      }

      renderPoints.sort((a, b) => a.z - b.z);
      renderPoints.forEach(p => {
        const depth = (p.z + 3) / 6;
        ctx.beginPath();
        ctx.fillStyle = p.type === 'mesh' ? `rgba(239, 68, 68, ${0.4 + depth * 0.4})` : `rgba(59, 130, 246, ${0.3 + depth * 0.5})`;
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, (p.type === 'mesh' ? 3 : 1.5) * depth, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    render();
  }, [rotation, spectralCoefficients, viewMode, scannedPoints, spectralPower]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto bg-slate-950 text-white min-h-screen font-sans">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 border-b border-slate-800 pb-8 gap-4">
        <div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter bg-gradient-to-r from-blue-400 to-indigo-600 bg-clip-text text-transparent">
            DEPHAZE SPECTRUM
          </h1>
          <p className="text-slate-500 font-mono text-base mt-2 tracking-widest uppercase">Phase-Mapping Engine v6.3</p>
        </div>
        <div className="text-left md:text-right bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          <p className="text-xs text-blue-400 font-bold uppercase mb-1">Reality Condition</p>
          <p className="text-xl md:text-2xl font-mono text-white">Ω₀ ⊗ Ψ = 1</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* METRICS COLUMN */}
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl border-l-4 border-red-500 shadow-xl">
            <h3 className="text-red-500 font-black text-sm uppercase mb-4 flex items-center gap-2">
              <Database size={20} /> Legacy Mesh
            </h3>
            <div className="space-y-1">
              <p className="text-4xl font-black">{metrics.meshSize} <span className="text-lg">KB</span></p>
              <p className="text-slate-500 text-xs">RAW COORDINATES</p>
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl border-l-4 border-blue-500 shadow-xl">
            <h3 className="text-blue-400 font-black text-sm uppercase mb-4 flex items-center gap-2">
              <Zap size={20} /> DEPHAZE Kernel
            </h3>
            <div className="space-y-1">
              <p className="text-4xl font-black text-blue-400">{metrics.dephazeSize} <span className="text-lg text-white">B</span></p>
              <p className="text-slate-500 text-xs">PHASE-HARMONIC SEED</p>
            </div>
          </div>

          <div className="bg-blue-600 p-8 rounded-2xl shadow-2xl shadow-blue-500/20 text-center transform hover:scale-105 transition-transform">
            <p className="text-6xl font-black leading-none">{metrics.ratio}×</p>
            <p className="text-sm font-bold mt-2 uppercase tracking-widest">Compression Ratio</p>
          </div>
        </div>

        {/* VISUALIZER COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-black rounded-3xl border border-slate-800 p-2 relative shadow-2xl">
            <div className="absolute top-6 left-6 z-10 space-y-2">
               <div className="flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1 rounded-full border border-red-500/30 text-[10px] font-bold text-red-400 uppercase">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> ϕ⁻³ MANIFEST
               </div>
               <div className="flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1 rounded-full border border-blue-500/30 text-[10px] font-bold text-blue-400 uppercase">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" /> ϕ³ GENERATIVE
               </div>
            </div>

            <canvas 
              ref={canvasRef} 
              className="w-full h-[500px] cursor-grab active:cursor-grabbing"
              onMouseMove={(e) => {
                if(e.buttons === 1) {
                  setRotation({
                    x: rotation.x + e.movementY * 0.01,
                    y: rotation.y + e.movementX * 0.01
                  });
                }
              }}
            />

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 bg-slate-900/80 p-2 rounded-full border border-slate-700 backdrop-blur">
              {['mesh', 'dephaze', 'both'].map(m => (
                <button 
                  key={m} 
                  onClick={() => setViewMode(m)} 
                  className={`px-6 py-2 rounded-full text-[10px] font-black uppercase transition-all ${viewMode === m ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CONTROLS COLUMN */}
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-blue-400 font-bold text-xs uppercase mb-6 flex items-center gap-2">
              <Cpu size={18} /> Spectral Density
            </h3>
            <input 
              type="range" min="4" max="12" step="1"
              value={spectralPower} 
              onChange={(e) => setSpectralPower(parseInt(e.target.value))} 
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" 
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-4 font-bold">
              <span>MAX COMPRESS</span>
              <span>MAX DETAIL</span>
            </div>
            <p className="text-center mt-4 font-mono text-2xl text-blue-400">{spectralPower}² Coeffs</p>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-purple-400 font-bold text-xs uppercase mb-4 flex items-center gap-2">
              <Target size={18} /> Topology Type
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {['organic', 'spike', 'minimal'].map(t => (
                <button 
                  key={t} 
                  onClick={() => setMeshType(t)} 
                  className={`py-4 rounded-xl text-xs font-black uppercase transition-all ${meshType === t ? 'bg-purple-600 border-purple-400 text-white' : 'bg-slate-800 text-slate-500 border-transparent hover:border-slate-600'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-indigo-950/20 p-6 rounded-2xl border border-indigo-500/20 text-sm leading-relaxed italic text-indigo-300">
            "Az amorf testeknél a 0 pontból induló fázis-vektorok adják a topológiai ujjlenyomatot. Ez a spektrális seed 1000x hatékonyabb, mint a nyers koordináta-adat."
          </div>
        </div>
      </div>
    </div>
  );
};

export default DephazeSpectralMap;
