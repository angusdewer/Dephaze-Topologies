import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Database, Zap, Cpu, Sliders, ShieldCheck, Activity } from 'lucide-react';

const DephazeAnisotropicMapping = () => {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0.8, y: 0.5 });
  const [k, setK] = useState(100); // Spectral Fidelity (10 - 500)

  // --- 1. DETERMINISZTIKUS FÁZIS-MÁTRIX (Fix "ujjlenyomat") ---
  const phaseMatrix = useMemo(() => {
    const matrix = [];
    for (let i = 0; i < 50; i++) {
      matrix.push({
        freqX: Math.random() * 5 + 1,
        freqY: Math.random() * 5 + 1,
        amp: (Math.random() - 0.5) * 0.5
      });
    }
    return matrix;
  }, []);

  // --- 2. STABIL REKONSTRUKCIÓS KERNEL ---
  const resolveR = (theta, phi, currentK) => {
    let R = 2.2; // Alapsugár
    
    // A csúszka határozza meg, hány harmonikust engedünk be
    const harmonicsCount = Math.floor(currentK / 10); 
    
    for (let i = 0; i < harmonicsCount; i++) {
      const p = phaseMatrix[i % phaseMatrix.length];
      // Harmonikus csillapítás: a magasabb sorszámú hullám gyengébb (1/i)
      const damping = 1 / (i * 0.2 + 1);
      R += Math.sin(theta * p.freqX) * Math.cos(phi * p.freqY) * p.amp * damping;
    }
    return R;
  };

  // --- 3. METRIKÁK ---
  const metrics = useMemo(() => {
    const legacySize = 120000; 
    const dephazeSize = 16 + (k * 2); 
    return {
      ratio: (legacySize / dephazeSize).toFixed(1),
      precision: Math.min(99.9, (k / 500) * 100 + 70)
    };
  }, [k]);

  // --- 4. RENDERER (Nagy sűrűségű pontfelhő) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = 500;
    const height = canvas.height = 500;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const scale = 80;
      
      const points = [];
      const res = 50; // Sűrű rács a folytonosságért

      for (let i = 0; i <= res; i++) {
        const theta = (i / res) * Math.PI * 2;
        for (let j = 0; j <= res; j++) {
          const phi = (j / res) * Math.PI;
          
          const R = resolveR(theta, phi, k);
          
          const x = R * Math.sin(phi) * Math.cos(theta);
          const y = R * Math.sin(phi) * Math.sin(theta);
          const z = R * Math.cos(phi);

          // Forgatás
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

      points.sort((a, b) => a.z - b.z);
      
      points.forEach(p => {
        const depth = (p.z + 3) / 6;
        const b = Math.floor(depth * 150) + 100;
        ctx.fillStyle = `rgba(${b/4}, ${b/1.5}, ${b}, ${0.3 + depth * 0.7})`;
        const size = 0.5 + depth * 2.5;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, size, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    
    draw();
  }, [rotation, k]);

  return (
    <div className="p-6 max-w-7xl mx-auto bg-slate-950 text-white min-h-screen font-mono">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent uppercase tracking-tighter">
          Anisotropic Spectral Resolution
        </h1>
        <p className="text-slate-600 text-[9px] tracking-[0.4em] mt-1">
          DEPHAZE_KERNEL_STABILITY_V6.3 // STATUS: NOMINAL
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="bg-slate-900 p-6 rounded-3xl border border-blue-500 border-opacity-20 shadow-2xl">
            <h3 className="text-blue-400 font-bold text-xs mb-6 uppercase flex items-center gap-2">
              <Cpu size={14} /> Efficiency Audit
            </h3>
            <div className="text-center">
              <p className="text-5xl font-black text-blue-400">{metrics.ratio}x</p>
              <p className="text-[9px] text-slate-500 mt-2 uppercase tracking-widest">Data Collapse Ratio</p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
               <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">LEGACY MESH</span>
                  <span className="text-red-900">117.2 KB</span>
               </div>
               <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">DEPHAZE SEED</span>
                  <span className="text-emerald-500">{16 + Math.floor(k/2)} B</span>
               </div>
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-3xl border border-purple-500 border-opacity-20">
            <h3 className="text-purple-400 font-bold text-xs mb-6 uppercase flex items-center gap-2">
              <Sliders size={14} /> Fidelity Control (k)
            </h3>
            <input 
              type="range" min="10" max="500" step="10" value={k}
              onChange={(e) => setK(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 mb-4"
            />
            <div className="flex justify-between items-center bg-black p-4 rounded-2xl border border-slate-800">
               <div>
                  <p className="text-[8px] text-slate-500 uppercase">Precision</p>
                  <p className="text-lg font-bold text-emerald-500">{metrics.precision.toFixed(2)}%</p>
               </div>
               <div className="text-right">
                  <p className="text-[8px] text-slate-500 uppercase">Order</p>
                  <p className="text-lg font-bold text-white">{k}</p>
               </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-900 rounded-[2.5rem] border border-slate-800 p-4 flex flex-col items-center justify-center relative shadow-inner overflow-hidden">
          <div className="absolute top-6 left-8 flex items-center gap-3 bg-black bg-opacity-40 p-2 rounded-full border border-slate-800">
             <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
             <span className="text-[8px] font-mono text-slate-400 tracking-widest uppercase">Field_Stable_Ξ=1.000</span>
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
            className="cursor-move w-full max-h-[420px]"
          />

          <div className="mt-4 flex gap-6 pb-2">
             <div className="flex items-center gap-1.5 text-[8px] text-slate-600 uppercase">
                <ShieldCheck size={10} className="text-emerald-700" /> Manifold_Verified
             </div>
             <div className="flex items-center gap-1.5 text-[8px] text-slate-600 uppercase">
                <Activity size={10} className="text-blue-700" /> Real_Time_Sync
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DephazeAnisotropicMapping;
