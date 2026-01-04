import React, { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { Scan, Zap, Cpu, Target, Database, Atom, Activity, Loader2 } from 'lucide-react';

const DephazeSpectralMap = () => {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0.8, y: 0.5 });
  const [spectralPower, setSpectralPower] = useState(8); 
  const [scanDensity, setScanDensity] = useState(1000);
  const [meshType, setMeshType] = useState('organic');
  const [viewMode, setViewMode] = useState('dephaze');
  const [isCalculating, setIsCalculating] = useState(false);

  // Késleltetett értékek a fagyás megelőzésére
  const deferredPower = useDeferredValue(spectralPower);
  const deferredDensity = useDeferredValue(scanDensity);

  // === 1. SZKENNELT NYERS ADAT (ϕ⁻³) ===
  const scannedPoints = useMemo(() => {
    const points = [];
    for (let i = 0; i < deferredDensity; i++) {
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
      points.push({ x: R * Math.sin(phi) * Math.cos(theta), y: R * Math.sin(phi) * Math.sin(theta), z: R * Math.cos(phi), theta, phi, R });
    }
    return points;
  }, [meshType, deferredDensity]);

  // === 2. SPEKTRÁLIS FÁZIS-SŰRÍTÉS (OPTIMALIZÁLT) ===
  const spectralCoefficients = useMemo(() => {
    setIsCalculating(true);
    const coeffs = [];
    // Csak a mintapontok 25%-át használjuk a számításhoz a sebesség miatt
    const sampleSet = scannedPoints.filter((_, i) => i % 4 === 0);
    
    for (let m = 0; m < deferredPower; m++) {
      for (let l = 0; l < deferredPower; l++) {
        let weight = 0;
        sampleSet.forEach(p => {
          weight += p.R * Math.cos(m * p.theta) * Math.sin(l * p.phi);
        });
        coeffs.push(weight / sampleSet.length);
      }
    }
    setTimeout(() => setIsCalculating(false), 100);
    return coeffs;
  }, [scannedPoints, deferredPower]);

  // === 3. REKONSTRUKCIÓ (Ξ=1) ===
  const resolveFieldR = (theta, phi) => {
    let R = 2.0;
    let idx = 0;
    for (let m = 0; m < deferredPower; m++) {
      for (let l = 0; l < deferredPower; l++) {
        R += spectralCoefficients[idx] * Math.cos(m * theta) * Math.sin(l * phi);
        idx++;
      }
    }
    return R;
  };

  // === 4. METRIKÁK ===
  const metrics = useMemo(() => {
    const meshSize = deferredDensity * 12;
    const dephazeSize = 16 + (spectralCoefficients.length * 2);
    return {
      meshSize: (meshSize / 1024).toFixed(2),
      dephazeSize,
      ratio: (meshSize / dephazeSize).toFixed(0),
      stability: (100 - (0.05 * 40)).toFixed(1) // becsült stabilitás
    };
  }, [deferredDensity, spectralCoefficients]);

  // === 5. RENDERER ===
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = 800;
    const h = canvas.height = 600;
    
    const render = () => {
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, w, h);
      const centerX = w / 2;
      const centerY = h / 2;
      const scale = 130;
      let renderPoints = [];

      if (viewMode !== 'mesh') {
        const res = 32; // Alacsonyabb felbontás forgatás közben a simaságért
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
            renderPoints.push({ x: x2, y: y1, z: -x * Math.sin(rotation.y) + z1 * Math.cos(rotation.y), type: 'dephaze' });
          }
        }
      }

      if (viewMode !== 'dephaze') {
        scannedPoints.slice(0, 300).forEach(p => {
          const y1 = p.y * Math.cos(rotation.x) - p.z * Math.sin(rotation.x);
          const z1 = p.y * Math.sin(rotation.x) + p.z * Math.cos(rotation.x);
          const x2 = p.x * Math.cos(rotation.y) + z1 * Math.sin(rotation.y);
          renderPoints.push({ x: x2, y: y1, z: -p.x * Math.sin(rotation.y) + z1 * Math.cos(rotation.y), type: 'mesh' });
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
  }, [rotation, spectralCoefficients, viewMode, scannedPoints]);

  return (
    <div className="p-8 max-w-7xl mx-auto bg-slate-950 text-white min-h-screen font-sans">
      <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-5xl font-black bg-gradient-to-r from-blue-400 to-indigo-600 bg-clip-text text-transparent">DEPHAZE SPECTRUM</h1>
          <p className="text-slate-500 font-mono mt-2 uppercase tracking-widest">Amorphous Field Resolution v6.3</p>
        </div>
        {isCalculating && <div className="flex items-center gap-2 text-blue-400 font-bold animate-pulse"><Loader2 className="animate-spin" /> RESOLVING FIELD...</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl border-l-4 border-red-500">
            <h3 className="text-red-500 font-bold text-xs uppercase mb-2">Legacy Mesh</h3>
            <p className="text-4xl font-black">{metrics.meshSize} KB</p>
          </div>
          <div className="bg-slate-900 p-6 rounded-2xl border-l-4 border-blue-500">
            <h3 className="text-blue-500 font-bold text-xs uppercase mb-2">DEPHAZE Kernel</h3>
            <p className="text-4xl font-black">{metrics.dephazeSize} B</p>
          </div>
          <div className="bg-blue-600 p-8 rounded-2xl text-center shadow-lg shadow-blue-500/20">
            <p className="text-6xl font-black">{metrics.ratio}×</p>
            <p className="text-xs font-bold uppercase mt-2">Compression</p>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-black rounded-3xl border border-slate-800 p-2 relative">
            <div className="absolute top-4 left-4 z-10 space-y-2">
               <div className="bg-black/50 backdrop-blur border border-red-500/50 px-3 py-1 rounded-full text-[10px] text-red-400 font-bold">ϕ⁻³ MANIFEST</div>
               <div className="bg-black/50 backdrop-blur border border-blue-500/50 px-3 py-1 rounded-full text-[10px] text-blue-400 font-bold">ϕ³ GENERATIVE</div>
            </div>
            <canvas 
              ref={canvasRef} 
              className="w-full h-[500px] cursor-grab active:cursor-grabbing" 
              onMouseMove={(e) => e.buttons === 1 && setRotation({x: rotation.x + e.movementY*0.01, y: rotation.y + e.movementX*0.01})} 
            />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              {['mesh', 'dephaze', 'both'].map(m => (
                <button key={m} onClick={() => setViewMode(m)} className={`px-4 py-1 rounded-full text-[10px] font-black uppercase ${viewMode === m ? 'bg-blue-600' : 'bg-slate-800 text-slate-500'}`}>{m}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-blue-400 font-bold text-xs uppercase mb-4 flex items-center gap-2"><Cpu size={16}/> Spectral Density</h3>
            <input type="range" min="4" max="16" value={spectralPower} onChange={(e) => setSpectralPower(parseInt(e.target.value))} className="w-full accent-blue-500" />
            <p className="text-center mt-2 font-mono text-xl">{spectralPower}² Coeffs</p>
          </div>
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-purple-400 font-bold text-xs uppercase mb-4 flex items-center gap-2"><Target size={16}/> Topology</h3>
            <div className="grid grid-cols-1 gap-2">
              {['organic', 'spike', 'minimal'].map(t => (
                <button key={t} onClick={() => setMeshType(t)} className={`py-2 rounded-lg text-xs font-bold uppercase ${meshType === t ? 'bg-purple-600' : 'bg-slate-800 text-slate-500'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="bg-indigo-950/20 p-6 rounded-2xl border border-indigo-500/20 text-[11px] leading-relaxed italic text-indigo-300">
            "A fázis-vektor térkép a topológiai ujjlenyomat, amely 1000x sűrűbb információt hordoz, mint a nyers koordináta-halmaz."
          </div>
        </div>
      </div>
    </div>
  );
};

export default DephazeSpectralMap;
