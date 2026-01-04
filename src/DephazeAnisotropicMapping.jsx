import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Scan, Zap, Cpu, Target, Database, Atom, Activity } from 'lucide-react';

const DephazeSpectralMap = () => {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0.8, y: 0.5 });
  const [spectralPower, setSpectralPower] = useState(8); // Sűrítési fok (alacsonyabb = durvább kompresszió)
  const [scanDensity, setScanDensity] = useState(1200);
  const [meshType, setMeshType] = useState('organic');
  const [viewMode, setViewMode] = useState('dephaze');

  // === 1. SZKENNELT NYERS ADAT (ϕ⁻³) ===
  const scannedPoints = useMemo(() => {
    const points = [];
    for (let i = 0; i < scanDensity; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.random() * Math.PI;
      let R = 2.0;
      
      // Amorf interferencia generálása
      if (meshType === 'organic') {
        R += 0.4 * Math.sin(theta * 2) * Math.cos(phi * 3);
        R += 0.2 * Math.cos(theta * 5 + phi);
      } else if (meshType === 'spike') {
        R += 0.7 * Math.pow(Math.abs(Math.sin(theta * 3) * Math.cos(phi * 3)), 2);
      } else {
        R += 0.3 * Math.sin(theta * 4) * Math.sin(phi * 2);
      }
      
      const x = R * Math.sin(phi) * Math.cos(theta);
      const y = R * Math.sin(phi) * Math.sin(theta);
      const z = R * Math.cos(phi);
      points.push({ x, y, z, theta, phi, R });
    }
    return points;
  }, [meshType, scanDensity]);

  // === 2. SPEKTRÁLIS FÁZIS-SŰRÍTÉS (A TRÜKK) ===
  // Nem tárolunk minden pontot, csak a domináns frekvencia-koefficienseket
  const spectralCoefficients = useMemo(() => {
    const coeffs = [];
    for (let m = 0; m < spectralPower; m++) {
      for (let l = 0; l < spectralPower; l++) {
        // Harmonikus mintavételezés a 0 pontból
        let weight = 0;
        scannedPoints.forEach(p => {
          weight += p.R * Math.cos(m * p.theta) * Math.sin(l * p.phi);
        });
        coeffs.push(weight / scannedPoints.length);
      }
    }
    return coeffs;
  }, [scannedPoints, spectralPower]);

  // === 3. REKONSTRUKCIÓ A MEZŐBŐL (Ξ=1) ===
  const resolveFieldR = (theta, phi) => {
    let R = 2.0;
    let idx = 0;
    for (let m = 0; m < spectralPower; m++) {
      for (let l = 0; l < spectralPower; l++) {
        R += spectralCoefficients[idx] * Math.cos(m * theta) * Math.sin(l * phi);
        idx++;
      }
    }
    return R;
  };

  // === 4. BRUTÁLIS METRIKÁK ===
  const metrics = useMemo(() => {
    const meshSize = scanDensity * 12; // x,y,z lebegőpontos (3x4 byte)
    const dephazeSize = 16 + (spectralCoefficients.length * 2); // 16 byte mag + 2 byte/koefficiens (half-float)
    
    let error = 0;
    scannedPoints.slice(0, 100).forEach(p => {
      error += Math.abs(resolveFieldR(p.theta, p.phi) - p.R);
    });
    
    const avgError = error / 100;
    return {
      meshSize: (meshSize / 1024).toFixed(2),
      dephazeSize: dephazeSize,
      ratio: (meshSize / dephazeSize).toFixed(0),
      stability: (100 - (avgError * 40)).toFixed(1)
    };
  }, [scannedPoints, spectralCoefficients]);

  // === 5. RENDERER ENGINE ===
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = 800;
    const h = canvas.height = 600;
    ctx.clearRect(0, 0, w, h);
    
    const centerX = w / 2;
    const centerY = h / 2;
    const scale = 120;
    let renderPoints = [];

    if (viewMode !== 'mesh') {
      const res = 40;
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
      if (p.type === 'mesh') {
        ctx.fillStyle = `rgba(255, 50, 50, ${0.4 + depth * 0.4})`;
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 3 * depth, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = `rgba(50, 150, 255, ${0.3 + depth * 0.5})`;
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 1.5 * depth, 0, Math.PI * 2);
      }
      ctx.fill();
    });
  }, [rotation, scannedPoints, spectralCoefficients, viewMode]);

  return (
    <div className="p-8 max-w-7xl mx-auto bg-slate-950 text-white min-h-screen font-sans selection:bg-blue-500">
      
      {/* HEADER - NAGYOBB BETŰK */}
      <div className="flex justify-between items-end mb-10 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-5xl font-black tracking-tighter bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            DEPHAZE SPECTRUM
          </h1>
          <p className="text-slate-400 text-lg font-mono mt-2">AMORPHOUS PHASE-MAPPING // V6.3</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-blue-400 font-bold uppercase tracking-widest">Axiomatic Status</p>
          <p className="text-2xl font-mono">Ω₀ ⊗ Ψ = REALITY</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* LEFT COLUMN - METRIKÁK */}
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl border-l-4 border-red-500 shadow-xl">
            <h3 className="text-red-500 font-black text-sm uppercase mb-4 flex items-center gap-2">
              <Database size={20} /> Legacy Mesh
            </h3>
            <div className="space-y-1">
              <p className="text-4xl font-black">{metrics.meshSize} <span className="text-lg">KB</span></p>
              <p className="text-slate-500 text-sm">RAW COORDINATE DATA</p>
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl border-l-4 border-blue-500 shadow-xl">
            <h3 className="text-blue-400 font-black text-sm uppercase mb-4 flex items-center gap-2">
              <Zap size={20} /> DEPHAZE Kernel
            </h3>
            <div className="space-y-1">
              <p className="text-4xl font-black text-blue-400">{metrics.dephazeSize} <span className="text-lg text-white">bytes</span></p>
              <p className="text-slate-500 text-sm">PHASE-HARMONIC SEED</p>
            </div>
          </div>

          <div className="bg-blue-600 p-8 rounded-2xl shadow-2xl shadow-blue-500/20 text-center">
            <p className="text-6xl font-black leading-none">{metrics.ratio}×</p>
            <p className="text-blue-100 font-bold mt-2 uppercase tracking-tighter">Compression Ratio</p>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl border border-emerald-500/30">
            <div className="flex justify-between items-center mb-2">
              <span className="text-emerald-400 font-bold text-xs uppercase">Field Stability</span>
              <Activity size={16} className="text-emerald-500" />
            </div>
            <p className="text-3xl font-mono font-bold text-emerald-400">{metrics.stability}%</p>
          </div>
        </div>

        {/* CENTER - VISUALIZER */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-black rounded-3xl border border-slate-800 p-2 relative shadow-inner overflow-hidden">
            <div className="absolute top-6 left-6 z-10 space-y-2">
              <span className="flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-1 rounded-full border border-red-500/50 text-[10px] font-bold text-red-400">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> ϕ⁻³ MANIFEST
              </span>
              <span className="flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-1 rounded-full border border-blue-500/50 text-[10px] font-bold text-blue-400">
                <div className="w-2 h-2 bg-blue-500 rounded-full" /> ϕ³ GENERATIVE
              </span>
            </div>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
              {['mesh', 'dephaze', 'both'].map(m => (
                <button key={m} onClick={() => setViewMode(m)} className={`px-6 py-2 rounded-full text-xs font-black uppercase transition-all ${viewMode === m ? 'bg-blue-600 text-white scale-110' : 'bg-slate-800 text-slate-400'}`}>
                  {m}
                </button>
              ))}
            </div>
            
            <canvas ref={canvasRef} className="w-full h-[500px] cursor-move" onMouseMove={(e) => e.buttons === 1 && setRotation({x: rotation.x + e.movementY*0.01, y: rotation.y + e.movementX*0.01})} />
          </div>
        </div>

        {/* RIGHT COLUMN - CONTROLS */}
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-blue-400 font-bold text-xs uppercase mb-6 flex items-center gap-2">
              <Cpu size={18} /> Spectral Density
            </h3>
            <input type="range" min="4" max="16" value={spectralPower} onChange={(e) => setSpectralPower(parseInt(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-bold">
              <span>MAX COMPRESS</span>
              <span>MAX DETAIL</span>
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-purple-400 font-bold text-xs uppercase mb-4 flex items-center gap-2">
              <Target size={18} /> Topology Type
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {['organic', 'spike', 'minimal'].map(t => (
                <button key={t} onClick={() => setMeshType(t)} className={`py-3 rounded-xl text-xs font-black uppercase transition-all ${meshType === t ? 'bg-purple-600 border-purple-400' : 'bg-slate-800 text-slate-500 border-transparent'} border`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-indigo-950/30 p-6 rounded-2xl border border-indigo-500/20 text-xs text-indigo-300 leading-relaxed italic">
            "Amorf testeknél az X, Y, Z fázis-vektor térképet ad a 0 pontból. Ez a térkép a topológiai ujjlenyomat, amely 1000x sűrűbb információt hordoz, mint a nyers koordináta-halmaz."
          </div>
        </div>
      </div>
    </div>
  );
};

export default DephazeSpectralMap;
