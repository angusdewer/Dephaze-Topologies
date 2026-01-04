import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Scan, Zap, Cpu, Target, Database, Atom, Waves } from 'lucide-react';

const DephazePhaseMap = () => {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0.8, y: 0.5 });
  const [phaseResolution, setPhaseResolution] = useState(32);
  const [scanDensity, setScanDensity] = useState(500);
  const [meshType, setMeshType] = useState('bumpy');
  const [viewMode, setViewMode] = useState('both');
  const [compressionMode, setCompressionMode] = useState('spatial'); // 'spatial' or 'fourier'
  const [fourierTopK, setFourierTopK] = useState(20);

  // === 1. SCANNING (φ⁻³ Observable Pattern) ===
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

  // === 2. PHASE MAP CONSTRUCTION (Spatial Domain) ===
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
    
    // Interpolate empty cells
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

  // === 3. FOURIER COMPRESSION (Frequency Domain) ===
  const fourierData = useMemo(() => {
    if (compressionMode !== 'fourier') return null;

    const matrix = phaseMap.map(row => row.map(cell => cell.R));
    const N = phaseResolution;
    
    // Calculate DC component (average)
    let dcSum = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        dcSum += matrix[i][j];
      }
    }
    const dc = dcSum / (N * N);
    
    // Calculate ALL Fourier coefficients with FULL spectrum
    const allCoeffs = [];
    
    // CRITICAL: Sample ENTIRE frequency space for accurate reconstruction
    const maxFreqX = Math.floor(N / 2);
    const maxFreqY = Math.floor(N / 2);
    
    for (let kx = -maxFreqX; kx <= maxFreqX; kx++) {
      for (let ky = -maxFreqY; ky <= maxFreqY; ky++) {
        if (kx === 0 && ky === 0) continue; // Skip DC
        
        let real = 0;
        let imag = 0;
        
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            const angle = -2 * Math.PI * (kx * i / N + ky * j / N);
            const val = matrix[i][j] - dc;
            real += val * Math.cos(angle);
            imag += val * Math.sin(angle);
          }
        }
        
        const amplitude = Math.sqrt(real * real + imag * imag);
        
        // Keep ALL non-zero coefficients for selection
        if (amplitude > 0.0001) {
          allCoeffs.push({
            kx, ky,
            real: real / (N * N),
            imag: imag / (N * N),
            amplitude: amplitude / (N * N)
          });
        }
      }
    }
    
    // Sort by amplitude (KEEP BOTH positive and negative frequencies!)
    allCoeffs.sort((a, b) => b.amplitude - a.amplitude);
    
    // Select top K (but ensure we capture all important features)
    const topCoeffs = allCoeffs.slice(0, Math.min(fourierTopK, allCoeffs.length));
    
    return {
      coefficients: topCoeffs,
      dc: dc,
      N: phaseResolution,
      totalCoeffs: allCoeffs.length
    };
  }, [phaseMap, phaseResolution, compressionMode, fourierTopK]);

  // === 4. RECONSTRUCTION ===
  const reconstructR = (theta, phi) => {
    if (compressionMode === 'fourier' && fourierData) {
      // HIGH-FIDELITY Fourier reconstruction
      const N = fourierData.N;
      
      // Continuous coordinates (not discretized)
      const ti = (theta / (2 * Math.PI)) * N;
      const tj = (phi / Math.PI) * N;
      
      // Start with DC (average value)
      let R = fourierData.dc;
      
      // Add ALL selected frequency components
      fourierData.coefficients.forEach(coeff => {
        const angle = 2 * Math.PI * (coeff.kx * ti / N + coeff.ky * tj / N);
        const contribution = coeff.real * Math.cos(angle) - coeff.imag * Math.sin(angle);
        R += contribution;
      });
      
      // MINIMAL clamping (only prevent extreme outliers)
      return Math.max(0.5, Math.min(4.0, R));
    } else {
      // Spatial domain reconstruction
      const ti = Math.floor((theta / (2 * Math.PI)) * phaseResolution) % phaseResolution;
      const tj = Math.floor((phi / Math.PI) * phaseResolution);
      
      if (tj < 0 || tj >= phaseResolution) return 2.0;
      return phaseMap[ti][tj].R;
    }
  };

  // === 5. METRICS (Ξ Stability) ===
  const metrics = useMemo(() => {
    const meshSize = scanDensity * 12;
    
    let dephazeSize;
    if (compressionMode === 'fourier') {
      // Fourier: K coefficients × 16 bytes (2 floats: real + imag) + metadata
      dephazeSize = 16 + (fourierTopK * 16) + 8;
    } else {
      // Spatial: resolution² × 4 bytes
      dephazeSize = 16 + (phaseResolution * phaseResolution * 4);
    }
    
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
      avgError: (avgError * 100).toFixed(2),
      compressionVsMesh: (meshSize / dephazeSize).toFixed(0)
    };
  }, [scannedPoints, phaseMap, phaseResolution, scanDensity, compressionMode, fourierTopK]);

  // === 6. 3D RENDERER ===
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = 600;
    const height = canvas.height = 600;

    ctx.clearRect(0, 0, width, height);
    
    const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width/2);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#020617');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 90;
    const points = [];

    if (viewMode !== 'mesh') {
      const res = 40;
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

    if (viewMode !== 'dephaze') {
      scannedPoints.slice(0, 250).forEach(p => {
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
      const depth = (p.z + 3.5) / 7;
      
      if (p.type === 'mesh') {
        ctx.fillStyle = `rgba(255, 60, 60, ${0.5 + depth * 0.4})`;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 2.5 + depth * 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = `rgba(255, 100, 100, ${0.2 + depth * 0.2})`;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 4 + depth * 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const color = compressionMode === 'fourier' 
          ? { r: 100, g: 255, b: 150 }  // Green for Fourier
          : { r: 100, g: 150, b: 255 }; // Blue for spatial
        
        const brightness = depth;
        ctx.fillStyle = `rgba(${color.r * brightness}, ${color.g * brightness}, ${color.b}, ${0.4 + depth * 0.5})`;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 1.5 + depth * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [rotation, scannedPoints, phaseMap, viewMode, phaseResolution, compressionMode, fourierData]);

  return (
    <div className="p-6 max-w-7xl mx-auto bg-slate-950 text-white min-h-screen font-mono">
      <div className="text-center mb-6">
        <h1 className="text-4xl font-black bg-gradient-to-r from-red-500 via-purple-500 to-blue-500 bg-clip-text text-transparent uppercase tracking-wider">
          DEPHAZE Phase Map
        </h1>
        <p className="text-slate-500 text-xs tracking-[0.3em] mt-2">
          AMORPHOUS GEOMETRY + FOURIER COMPRESSION
        </p>
        <p className="text-slate-600 text-[9px] tracking-[0.4em] mt-1">
          Ω₀ → φ³ ↔ φ⁻³ → Ξ=1
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-3">
          <div className="bg-purple-950 bg-opacity-50 p-4 rounded-xl border border-purple-600 border-opacity-40">
            <h3 className="text-purple-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Atom size={14} /> DEPHAZE Axioms
            </h3>
            <div className="text-[9px] text-purple-200 space-y-1.5 leading-relaxed">
              <p><span className="text-purple-400">Ω₀:</span> Invariant zero-point</p>
              <p><span className="text-purple-400">φ³:</span> Generative field</p>
              <p><span className="text-purple-400">φ⁻³:</span> Measured pattern</p>
              <p><span className="text-purple-400">Ξ:</span> φ³/φ⁻³ = 1</p>
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-red-500 border-opacity-40">
            <h3 className="text-red-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Database size={14} /> MESH (φ⁻³)
            </h3>
            <div className="bg-black bg-opacity-50 p-3 rounded-lg mb-2">
              <p className="text-[8px] text-slate-500 uppercase tracking-wider">Storage</p>
              <p className="text-2xl font-black text-red-500">{(metrics.meshSize/1024).toFixed(1)} KB</p>
            </div>
            <div className="bg-black bg-opacity-50 p-3 rounded-lg">
              <p className="text-[8px] text-slate-500 uppercase tracking-wider">Points</p>
              <p className="text-xl font-bold text-white">{scanDensity}</p>
            </div>
          </div>

          {/* Compression Mode Toggle */}
          <div className="bg-slate-900 p-4 rounded-xl border border-amber-500 border-opacity-40">
            <h3 className="text-amber-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Waves size={14} /> Compression Mode
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button 
                onClick={() => setCompressionMode('spatial')}
                className={`p-2 rounded-lg text-[9px] font-bold transition ${
                  compressionMode === 'spatial' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                SPATIAL
                <div className="text-[7px] opacity-70">Phase Map</div>
              </button>
              <button 
                onClick={() => setCompressionMode('fourier')}
                className={`p-2 rounded-lg text-[9px] font-bold transition ${
                  compressionMode === 'fourier' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                FOURIER
                <div className="text-[7px] opacity-70">FFT</div>
              </button>
            </div>
            
            {compressionMode === 'fourier' && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <p className="text-[8px] text-slate-400 mb-2 uppercase">Top-K Coefficients</p>
                <input 
                  type="range" min="5" max="100" step="5" value={fourierTopK}
                  onChange={(e) => setFourierTopK(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[7px] text-slate-500 mt-1 mb-2">
                  <span>Smooth (5)</span>
                  <span>Detailed (100)</span>
                </div>
                <p className="text-center text-lg font-bold text-green-400">K = {fourierTopK}</p>
                {fourierData && (
                  <p className="text-center text-[7px] text-slate-500 mt-1">
                    {fourierData.totalCoeffs} available
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-blue-500 border-opacity-40">
            <h3 className="text-blue-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Zap size={14} /> DEPHAZE (φ³)
            </h3>
            <div className="bg-black bg-opacity-50 p-3 rounded-lg mb-2">
              <p className="text-[8px] text-slate-500 uppercase tracking-wider">Storage</p>
              <p className="text-2xl font-black text-blue-500">
                {compressionMode === 'fourier' 
                  ? `${(metrics.dephazeSize).toFixed(0)} B` 
                  : `${(metrics.dephazeSize/1024).toFixed(1)} KB`
                }
              </p>
            </div>
            <div className="bg-black bg-opacity-50 p-3 rounded-lg">
              <p className="text-[8px] text-slate-500 uppercase tracking-wider">Method</p>
              <p className="text-sm font-bold text-white">
                {compressionMode === 'fourier' 
                  ? `${fourierTopK} Fourier coeffs` 
                  : `${phaseResolution}² cells`
                }
              </p>
            </div>
          </div>

          <div className="bg-emerald-950 bg-opacity-50 p-4 rounded-xl border border-emerald-600 border-opacity-50">
            <h3 className="text-emerald-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Target size={14} /> Ξ Stability
            </h3>
            <div className="text-center mb-3">
              <p className="text-4xl font-black text-white">{metrics.xiStability}%</p>
              <p className="text-[8px] text-slate-500 mt-1">Error: {metrics.avgError}%</p>
            </div>
            <div className="text-center pt-3 border-t border-emerald-800">
              <p className={`text-4xl font-black ${
                compressionMode === 'fourier' ? 'text-green-400' : 'text-emerald-400'
              }`}>
                {metrics.compressionVsMesh}×
              </p>
              <p className="text-[8px] text-slate-400 uppercase tracking-wider">vs Mesh</p>
              {compressionMode === 'fourier' && parseInt(metrics.compressionVsMesh) > 50 && (
                <div className="mt-2 bg-green-900 bg-opacity-30 p-2 rounded">
                  <p className="text-[8px] text-green-300 font-bold">🔥 EXTREME COMPRESSION!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <div className="bg-slate-900 bg-opacity-70 rounded-2xl border border-slate-700 p-4 relative overflow-hidden">
            <div className="absolute top-4 left-4 space-y-1.5 z-10 bg-black bg-opacity-60 p-3 rounded-lg backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full shadow-lg shadow-red-500/50" />
                <span className="text-[9px] text-red-300 uppercase">φ⁻³ Mesh</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full shadow-lg ${
                  compressionMode === 'fourier' 
                    ? 'bg-green-500 shadow-green-500/50' 
                    : 'bg-blue-500 shadow-blue-500/50'
                }`} />
                <span className={`text-[9px] uppercase ${
                  compressionMode === 'fourier' ? 'text-green-300' : 'text-blue-300'
                }`}>
                  φ³ {compressionMode === 'fourier' ? 'Fourier' : 'Spatial'}
                </span>
              </div>
            </div>

            <div className="absolute top-4 right-4 flex gap-1 z-10">
              <button 
                onClick={() => setViewMode('mesh')}
                className={`px-3 py-1.5 text-[9px] font-bold rounded transition ${
                  viewMode === 'mesh' ? 'bg-red-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                φ⁻³
              </button>
              <button 
                onClick={() => setViewMode('dephaze')}
                className={`px-3 py-1.5 text-[9px] font-bold rounded transition ${
                  viewMode === 'dephaze' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                φ³
              </button>
              <button 
                onClick={() => setViewMode('both')}
                className={`px-3 py-1.5 text-[9px] font-bold rounded transition ${
                  viewMode === 'both' ? 'bg-purple-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
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
              className="cursor-grab active:cursor-grabbing w-full rounded-lg"
            />
            
            <p className="text-center text-[8px] text-slate-500 mt-2 uppercase tracking-wider">
              Drag to rotate
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 bg-opacity-70 p-4 rounded-xl border border-purple-500 border-opacity-30">
              <h3 className="text-purple-400 text-[10px] mb-3 uppercase flex items-center gap-2 font-bold">
                <Cpu size={12} /> Phase Resolution
              </h3>
              <input 
                type="range" min="16" max="64" step="8" value={phaseResolution}
                onChange={(e) => setPhaseResolution(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg"
              />
              <div className="text-center mt-3">
                <p className="text-2xl font-black text-white">{phaseResolution}²</p>
              </div>
            </div>

            <div className="bg-slate-900 bg-opacity-70 p-4 rounded-xl border border-cyan-500 border-opacity-30">
              <h3 className="text-cyan-400 text-[10px] mb-3 uppercase flex items-center gap-2 font-bold">
                <Scan size={12} /> Scan Density
              </h3>
              <input 
                type="range" min="200" max="2000" step="200" value={scanDensity}
                onChange={(e) => setScanDensity(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg"
              />
              <div className="text-center mt-3">
                <p className="text-2xl font-black text-white">{scanDensity}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {['bumpy', 'spike', 'organic'].map(type => (
              <button 
                key={type}
                onClick={() => setMeshType(type)}
                className={`p-3 rounded-lg text-[10px] font-bold uppercase transition ${
                  meshType === type 
                    ? 'bg-gradient-to-br from-purple-600 to-purple-800 text-white shadow-lg' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <div className="text-lg mb-1">
                  {type === 'bumpy' ? '🌊' : type === 'spike' ? '⚡' : '🧬'}
                </div>
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-slate-900 bg-opacity-50 p-4 rounded-lg border border-slate-700">
        <p className="text-[9px] text-slate-400 text-center leading-relaxed">
          <span className={compressionMode === 'fourier' ? 'text-green-400' : 'text-purple-400'}>
            {compressionMode === 'fourier' ? '🌊 FOURIER MODE:' : '📊 SPATIAL MODE:'}
          </span> {' '}
          {compressionMode === 'fourier' 
            ? `Using ${fourierTopK} frequency coefficients to reconstruct amorphous geometry. Low-frequency components capture smooth surfaces with ${metrics.compressionVsMesh}× compression vs mesh.`
            : `Using ${phaseResolution}×${phaseResolution} phase map cells. Spatial domain reconstruction with ${metrics.ratio}× compression.`
          }
        </p>
      </div>
    </div>
  );
};

export default DephazePhaseMap;
