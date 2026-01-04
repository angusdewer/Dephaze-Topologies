import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Scan, Zap, Cpu, Target, Database, Atom } from 'lucide-react';

const DephazePhaseMap = () => {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0.8, y: 0.5 });
  const [phaseResolution, setPhaseResolution] = useState(32);
  const [scanDensity, setScanDensity] = useState(500);
  const [meshType, setMeshType] = useState('bumpy');
  const [viewMode, setViewMode] = useState('dephaze');

  // === 1. SZKENNELÉS ===
  const scannedPoints = useMemo(() => {
    const points = [];
    
    for (let i = 0; i < scanDensity; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.random() * Math.PI;
      
      let R = 2.0;
      
      if (meshType === 'bumpy') {
        R += 0.35 * Math.sin(theta * 3) * Math.cos(phi * 2);
        R += 0.25 * Math.sin(theta * 5 + phi * 3);
      } else if (meshType === 'spike') {
        R += 0.6 * Math.abs(Math.sin(theta * 2)) * Math.abs(Math.cos(phi * 2));
      } else {
        R += 0.3 * Math.sin(theta * 2.3 + phi * 1.7);
        R += 0.15 * Math.cos(theta * 4.1) * Math.sin(phi * 3.3);
      }
      
      const x = R * Math.sin(phi) * Math.cos(theta);
      const y = R * Math.sin(phi) * Math.sin(theta);
      const z = R * Math.cos(phi);
      
      points.push({ x, y, z, theta, phi, R });
    }
    
    return points;
  }, [meshType, scanDensity]);

  // === 2. FÁZISTÉRKÉP ===
  const phaseMap = useMemo(() => {
    const map = Array(phaseResolution).fill(null).map(() => 
      Array(phaseResolution).fill(null).map(() => ({ R: 2.0, count: 0 }))
    );
    
    scannedPoints.forEach(p => {
      const thetaIdx = Math.floor((p.theta / (2 * Math.PI)) * phaseResolution) % phaseResolution;
      const phiIdx = Math.floor((p.phi / Math.PI) * phaseResolution);
      
      if (phiIdx >= 0 && phiIdx < phaseResolution) {
        if (map[thetaIdx][phiIdx].count === 0) {
          map[thetaIdx][phiIdx].R = p.R;
        } else {
          map[thetaIdx][phiIdx].R = (map[thetaIdx][phiIdx].R * map[thetaIdx][phiIdx].count + p.R) / (map[thetaIdx][phiIdx].count + 1);
        }
        map[thetaIdx][phiIdx].count += 1;
      }
    });
    
    // Gyors interpoláció üres cellákra
    for (let i = 0; i < phaseResolution; i++) {
      for (let j = 0; j < phaseResolution; j++) {
        if (map[i][j].count === 0) {
          const i1 = (i - 1 + phaseResolution) % phaseResolution;
          const i2 = (i + 1) % phaseResolution;
          const j1 = Math.max(0, j - 1);
          const j2 = Math.min(phaseResolution - 1, j + 1);
          
          let sum = 0;
          let cnt = 0;
          if (map[i1][j].count > 0) { sum += map[i1][j].R; cnt++; }
          if (map[i2][j].count > 0) { sum += map[i2][j].R; cnt++; }
          if (map[i][j1].count > 0) { sum += map[i][j1].R; cnt++; }
          if (map[i][j2].count > 0) { sum += map[i][j2].R; cnt++; }
          
          map[i][j].R = cnt > 0 ? sum / cnt : 2.0;
        }
      }
    }
    
    return map;
  }, [scannedPoints, phaseResolution]);

  // === 3. GYORS REKONSTRUKCIÓ ===
  const reconstructR = (theta, phi) => {
    const ti = Math.floor((theta / (2 * Math.PI)) * phaseResolution) % phaseResolution;
    const tj = Math.floor((phi / Math.PI) * phaseResolution);
    
    if (tj < 0 || tj >= phaseResolution) return 2.0;
    
    return phaseMap[ti][tj].R;
  };

  // === 4. METRIKÁK ===
  const metrics = useMemo(() => {
    const meshSize = scanDensity * 12;
    const dephazeSize = 16 + (phaseResolution * phaseResolution * 4);
    
    let errorSum = 0;
    scannedPoints.forEach(p => {
      const reconstructed = reconstructR(p.theta, p.phi);
      errorSum += Math.abs(reconstructed - p.R);
    });
    
    const avgError = errorSum / scannedPoints.length;
    const xiStability = Math.max(0, 100 - (avgError * 50));
    
    return {
      meshSize,
      dephazeSize,
      ratio: (meshSize / dephazeSize).toFixed(1),
      xiStability: xiStability.toFixed(1),
      avgError: (avgError * 100).toFixed(2)
    };
  }, [scannedPoints, phaseMap, phaseResolution, scanDensity]);

  // === 5. RENDERER ===
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = 600;
    const height = canvas.height = 600;

    ctx.clearRect(0, 0, width, height);
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 90;
    const points = [];

    // DEPHAZE
    if (viewMode !== 'mesh') {
      const res = 35;
      for (let i = 0; i <= res; i++) {
        const theta = (i / res) * Math.PI * 2;
        for (let j = 0; j <= res; j++) {
          const phi = (j / res) * Math.PI;
          const R = reconstructR(theta, phi);
          
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

          points.push({ x: x2, y: y1, z: z2, type: 'dephaze' });
        }
      }
    }

    // MESH
    if (viewMode !== 'dephaze') {
      scannedPoints.slice(0, 200).forEach(p => {
        const cosX = Math.cos(rotation.x);
        const sinX = Math.sin(rotation.x);
        const y1 = p.y * cosX - p.z * sinX;
        const z1 = p.y * sinX + p.z * cosX;

        const cosY = Math.cos(rotation.y);
        const sinY = Math.sin(rotation.y);
        const x2 = p.x * cosY + z1 * sinY;
        const z2 = -p.x * sinY + z1 * cosY;

        points.push({ x: x2, y: y1, z: z2, type: 'mesh' });
      });
    }

    points.sort((a, b) => a.z - b.z);
    
    points.forEach(p => {
      const depth = (p.z + 3) / 6;
      
      if (p.type === 'mesh') {
        ctx.fillStyle = `rgba(255, 60, 60, ${0.6 + depth * 0.3})`;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 2 + depth * 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const b = Math.floor(depth * 200) + 55;
        ctx.fillStyle = `rgba(${b/5}, ${b/1.8}, ${b}, ${0.3 + depth * 0.5})`;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 1 + depth * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [rotation, scannedPoints, phaseMap, viewMode]);

  return (
    <div className="p-6 max-w-6xl mx-auto bg-slate-950 text-white min-h-screen font-mono">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-black bg-gradient-to-r from-red-500 via-purple-500 to-blue-500 bg-clip-text text-transparent uppercase">
          DEPHAZE Phase Map
        </h1>
        <p className="text-slate-600 text-[9px] tracking-[0.4em] mt-2">
          Ω₀ // ϕ³↔ϕ⁻³ // Ξ=1
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-3">
          <div className="bg-purple-950 p-4 rounded-xl border border-purple-600 border-opacity-30">
            <h3 className="text-purple-400 font-bold text-[10px] mb-3 uppercase flex items-center gap-2">
              <Atom size={12} /> Axiómák
            </h3>
            <div className="text-[8px] text-purple-200 space-y-1 leading-relaxed">
              <p>Ω₀: Zeropoint</p>
              <p>ϕ³: Generatív</p>
              <p>ϕ⁻³: Megfigyelt</p>
              <p>Ξ=ϕ³/ϕ⁻³=1</p>
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-red-500 border-opacity-30">
            <h3 className="text-red-400 font-bold text-[10px] mb-3 uppercase flex items-center gap-2">
              <Database size={12} /> MESH
            </h3>
            <div className="bg-black p-3 rounded-lg mb-2">
              <p className="text-[7px] text-slate-500 uppercase">Méret</p>
              <p className="text-xl font-black text-red-500">{(metrics.meshSize/1024).toFixed(1)}KB</p>
            </div>
            <div className="bg-black p-3 rounded-lg">
              <p className="text-[7px] text-slate-500 uppercase">Pontok</p>
              <p className="text-lg font-bold text-white">{scanDensity}</p>
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-blue-500 border-opacity-30">
            <h3 className="text-blue-400 font-bold text-[10px] mb-3 uppercase flex items-center gap-2">
              <Zap size={12} /> DEPHAZE
            </h3>
            <div className="bg-black p-3 rounded-lg mb-2">
              <p className="text-[7px] text-slate-500 uppercase">Méret</p>
              <p className="text-xl font-black text-blue-500">{(metrics.dephazeSize/1024).toFixed(1)}KB</p>
            </div>
            <div className="bg-black p-3 rounded-lg">
              <p className="text-[7px] text-slate-500 uppercase">Térkép</p>
              <p className="text-lg font-bold text-white">{phaseResolution}²</p>
            </div>
          </div>

          <div className="bg-emerald-950 p-4 rounded-xl border border-emerald-600 border-opacity-40">
            <h3 className="text-emerald-400 font-bold text-[10px] mb-2 uppercase flex items-center gap-2">
              <Target size={12} /> Ξ Stabilitás
            </h3>
            <div className="text-center mb-2">
              <p className="text-3xl font-black text-white">{metrics.xiStability}%</p>
            </div>
            <div className="text-center pt-2 border-t border-emerald-800">
              <p className="text-2xl font-black text-white">{metrics.ratio}×</p>
              <p className="text-[7px] text-slate-400 uppercase">Kompresszió</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 relative">
            <div className="absolute top-4 left-4 space-y-1 z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-[8px] text-red-400 uppercase">ϕ⁻³ Szkennelt</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-[8px] text-blue-400 uppercase">ϕ³ Fázistérkép</span>
              </div>
            </div>

            <div className="absolute top-4 right-4 flex gap-1 z-10">
              <button 
                onClick={() => setViewMode('mesh')}
                className={`px-2 py-1 text-[8px] rounded ${viewMode === 'mesh' ? 'bg-red-600' : 'bg-slate-800'}`}
              >
                ϕ⁻³
              </button>
              <button 
                onClick={() => setViewMode('dephaze')}
                className={`px-2 py-1 text-[8px] rounded ${viewMode === 'dephaze' ? 'bg-blue-600' : 'bg-slate-800'}`}
              >
                ϕ³
              </button>
              <button 
                onClick={() => setViewMode('both')}
                className={`px-2 py-1 text-[8px] rounded ${viewMode === 'both' ? 'bg-purple-600' : 'bg-slate-800'}`}
              >
                BOTH
              </button>
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
              className="cursor-grab active:cursor-grabbing w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 p-3 rounded-xl">
              <h3 className="text-purple-400 text-[9px] mb-2 uppercase flex items-center gap-1">
                <Cpu size={10} /> Fázis Felbontás
              </h3>
              <input 
                type="range" min="16" max="64" step="8" value={phaseResolution}
                onChange={(e) => setPhaseResolution(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg accent-purple-500 mb-2"
              />
              <p className="text-center text-xl font-bold text-white">{phaseResolution}×{phaseResolution}</p>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl">
              <h3 className="text-cyan-400 text-[9px] mb-2 uppercase flex items-center gap-1">
                <Scan size={10} /> Szkennelés
              </h3>
              <input 
                type="range" min="200" max="2000" step="200" value={scanDensity}
                onChange={(e) => setScanDensity(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg accent-cyan-500 mb-2"
              />
              <p className="text-center text-xl font-bold text-white">{scanDensity}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => setMeshType('bumpy')}
              className={`flex-1 p-2 rounded-lg text-[10px] font-bold ${meshType === 'bumpy' ? 'bg-purple-600' : 'bg-slate-800'}`}
            >
              BUMPY
            </button>
            <button 
              onClick={() => setMeshType('spike')}
              className={`flex-1 p-2 rounded-lg text-[10px] font-bold ${meshType === 'spike' ? 'bg-purple-600' : 'bg-slate-800'}`}
            >
              SPIKE
            </button>
            <button 
              onClick={() => setMeshType('organic')}
              className={`flex-1 p-2 rounded-lg text-[10px] font-bold ${meshType === 'organic' ? 'bg-purple-600' : 'bg-slate-800'}`}
            >
              ORGANIC
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DephazePhaseMap;
