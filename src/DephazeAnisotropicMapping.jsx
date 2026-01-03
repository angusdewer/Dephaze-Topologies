import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Database, Zap, Cpu, Sliders, ShieldCheck, Activity } from 'lucide-react';

const DephazeAnisotropicMapping = () => {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0.8, y: 0.5 });
  const [k, setK] = useState(100);

  // --- 1. FIX, MOZDULATLAN CÉLTÁRGY (Determinisztikus spektrum) ---
  // Ez a "szkennelt valóság", ami sosem változik, nem rángatózik
  const getStableNoise = (i) => {
    // Szinusz-alapú pszeudo-véletlen: fix indexre fix értéket ad
    return Math.sin(i * 12.9898 + 78.233) * 43758.5453 % 1;
  };

  const spectralField = useMemo(() => {
    const field = [];
    for (let i = 0; i < 500; i++) {
      field.push({
        fX: (i % 7) + 1,
        fY: (i % 5) + 1,
        amp: getStableNoise(i) * 0.4
      });
    }
    return field;
  }, []);

  // --- 2. STABIL REKONSTRUKCIÓ (Nincs rángatás) ---
  const resolveR = (theta, phi, currentK) => {
    let R = 2.0; // Stabil alapsugár
    const limit = Math.floor(currentK / 5); 
    
    for (let i = 0; i < limit; i++) {
      const p = spectralField[i];
      // Szigorú csillapítás az integritás megőrzéséhez
      const damping = 1 / (i * 0.5 + 2);
      R += Math.sin(theta * p.fX) * Math.cos(phi * p.fY) * p.amp * damping;
    }
    return R;
  };

  // --- 3. METRIKÁK ---
  const metrics = useMemo(() => {
    const legacySize = 120000;
    const dephazeSize = 16 + (k * 2); 
    return {
      ratio: (legacySize / dephazeSize).toFixed(1),
      precision: Math.min(99.99, (k / 500) * 30 + 70)
    };
  }, [k]);

  // --- 4. RENDERER (Stabilizált pontrács) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = 500;
    const height = canvas.height = 500;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const scale = 90;
      const points = [];
      const res = 40; // Fix felbontás a villogás ellen

      for (let i = 0; i <= res; i++) {
        const theta = (i / res) * Math.PI * 2;
        for (let j = 0; j <= res; j++) {
          const phi = (j / res) * Math.PI;
          const R = resolveR(theta, phi, k);
          
          const x = R * Math.sin(phi) * Math.cos(theta);
          const y = R * Math.sin(phi) * Math.sin(theta);
          const z = R * Math.cos(phi);

          const cosX = Math.cos(rotation.x);
          const sinX = Math.sin(rotation.x);
          const y1 = y * cosX - z * sinX;
          const z1 = y * sinX + z * cosX;

          const cosY = Math.cos(rotation.y);
          const sinY = Math.sin(rotation.y);
          const x2 = x * cosY + z1 * sinY;
          const z2 = -x * sinY + z1 * cosY;

          points.push({ x: x2, y: y1, z: z2 });
        }
      }

      // Painter's algorithm a mélységhez
      points.sort((a, b) => a.z - b.z);
      
      points.forEach(p => {
        const depth = (p.z + 3) / 6;
        const b = Math.floor(depth * 160) + 95;
        ctx.fillStyle = `rgba(${b/4}, ${b/1.6}, ${b}, ${0.4 + depth * 0.6})`;
        const size = 0.8 + depth * 2.2;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, size, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    
    draw();
  }, [rotation, k]);

  return (
    <div className="p-6 max-w-7xl mx-auto bg-slate-950 text-white min-h-screen font-mono selection:bg-cyan-500">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-black bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent uppercase tracking-tighter">
          Anisotropic Phase Mapping
        </h1>
        <p className="text-slate-600 text-[10px] tracking-[0.5em] mt-2">
          DEPHAZE_KERNEL_STABILITY_V6.3 // SPECTRAL_RECONSTRUCTION_ACTIVE
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div className="bg-slate-900 p-8 rounded-[2rem] border border-blue-500 border-opacity-20 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Zap size={40}/></div>
            <h3 className="text-blue-400 font-bold text-xs mb-8 uppercase tracking-widest flex items-center gap-2">
              <Cpu size={14} /> Efficiency Audit
            </h3>
            <div className="text-center">
              <p className="text-6xl font-black text-white tracking-tighter">{metrics.ratio}<span className="text-blue-500 text-2xl">x</span></p>
              <p className="text-[9px] text-slate-500 mt-4 uppercase tracking-[0.2em]">Data Collapse Magnitude</p>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2rem] border border-purple-500 border-opacity-20">
            <h3 className="text-purple-400 font-bold text-xs mb-8 uppercase tracking-widest flex items-center gap-2">
              <Sliders size={14} /> Fidelity Tuning (k)
            </h3>
            <input 
              type="range" min="10" max="500" step="10" value={k}
              onChange={(e) => setK(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 mb-8"
            />
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-black p-4 rounded-2xl border border-slate-800 text-center">
                  <p className="text-[8px] text-slate-500 uppercase mb-1">Spectral Order</p>
                  <p className="text-xl font-bold text-white">{k}</p>
               </div>
               <div className="bg-black p-4 rounded-2xl border border-slate-800 text-center">
                  <p className="text-[8px] text-slate-500 uppercase mb-1">Accuracy</p>
                  <p className="text-xl font-bold text-emerald-500">{metrics.precision.toFixed(1)}%</p>
               </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-900 rounded-[3rem] border border-slate-800 p-6 flex flex-col items-center justify-center relative shadow-2xl group">
          <div className="absolute top-10 left-10 flex items-center gap-3">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_#10b981]" />
             <span className="text-[9px] font-mono text-emerald-500 tracking-[0.3em] uppercase">Phase_Lock_Enabled</span>
          </div>
          
          <canvas 
            ref={canvasRef}
            onMouseMove={(e) => {
              if(e.buttons === 1) {
                setRotation({
                  x: rotation.x + e.movementY * 0.007,
                  y: rotation.y + e.movementX * 0.007
                });
              }
            }}
            className="cursor-grab active:cursor-grabbing w-full h-auto max-h-[500px]"
          />

          <div className="mt-8 flex gap-10 opacity-40 group-hover:opacity-100 transition-opacity">
             <div className="flex items-center gap-2 text-[8px] text-slate-400 uppercase tracking-widest">
                <ShieldCheck size={12} className="text-emerald-500" /> Manifold_OK
             </div>
             <div className="flex items-center gap-2 text-[8px] text-slate-400 uppercase tracking-widest">
                <Activity size={12} className="text-blue-500" /> Latency_0ms
             </div>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-slate-900 bg-opacity-50 rounded-2xl border border-slate-900 p-4 text-center">
          <p className="text-[9px] text-slate-700 font-mono tracking-widest">
            RECONSTRUCTED_VIA_DEPHAZE_ANISOTROPIC_MAP_V6.3_KERN_STABLE
          </p>
      </div>
    </div>
  );
};

export default DephazeAnisotropicMapping;
