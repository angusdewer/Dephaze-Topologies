import React, { useState, useEffect, useRef } from 'react';
import { Sliders, Zap, Database } from 'lucide-react';

const DephazeUniversalKernel = () => {
  const canvasRef = useRef(null);
  const [n, setN] = useState(2);
  const [R, setR] = useState(2.5);
  const [rotation, setRotation] = useState({ x: 0.3, y: 0.4 });
  const [showGrid, setShowGrid] = useState(true);
  const [animate, setAnimate] = useState(false);
  const animationRef = useRef(null);

  /**
   * DEPHAZE Universal Stability Kernel
   * Calculates the stability coefficient Xi based on spatial coordinates.
   */
  const Xi = (x, y, z, R, n) => {
    if (n === Infinity || n > 50) {
      // Limit Topology (n → ∞): Cube (L∞ norm / Chebyshev distance)
      return R / Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
    }
    // General Topology: Lⁿ norm (Minkowski distance)
    const sum = Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n);
    return R / Math.pow(sum, 1/n);
  };

  /**
   * Existence Condition: surface is defined where Xi = 1.0
   */
  const exists = (x, y, z, R, n) => {
    const xi = Xi(x, y, z, R, n);
    return Math.abs(xi - 1.0) < 0.05; // Numerical tolerance for visualization
  };

  // 3D to 2D isometric projection
  const project3D = (x, y, z, rotX, rotY) => {
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;

    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x2 = x * cosY + z1 * sinY;
    const z2 = -x * sinY + z1 * cosY;

    return { x: x2, y: y1, z: z2 };
  };

  const getShapeName = (n) => {
    if (n < 1.3) return 'Octahedron';
    if (n < 1.7) return 'Transitionary State';
    if (n < 2.3) return 'Euclidean Sphere';
    if (n < 3.5) return 'Superquadric Transition';
    if (n < 8) return 'Rounded Cube';
    return 'Limit Topology (Cube)';
  };

  const calculateMemory = () => {
    const meshPoints = 10000;
    const meshBytes = meshPoints * 3 * 4; // xyz * float32
    const dephazeBytes = 16; // 2 parameters (R, n) * 8 bytes
    
    return {
      mesh: (meshBytes / 1024).toFixed(2) + ' KB',
      dephaze: dephazeBytes + ' bytes',
      ratio: (meshBytes / dephazeBytes).toFixed(0) + 'x'
    };
  };

  const render = (ctx, canvas) => {
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 50;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0a0e27');
    gradient.addColorStop(1, '#1a1e3a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (showGrid) {
      ctx.strokeStyle = 'rgba(100, 100, 150, 0.1)';
      ctx.lineWidth = 1;
      for (let i = -10; i <= 10; i++) {
        const projected = project3D(i * 0.5, 0, 0, rotation.x, rotation.y);
        const x = centerX + projected.x * scale;
        const y = centerY - projected.y * scale;
        ctx.beginPath();
        ctx.moveTo(x, centerY - 200);
        ctx.lineTo(x, centerY + 200);
        ctx.stroke();
      }
    }

    const points = [];
    const step = 0.15;
    
    for (let x = -3; x <= 3; x += step) {
      for (let y = -3; y <= 3; y += step) {
        for (let z = -3; z <= 3; z += step) {
          if (exists(x, y, z, R, n)) {
            const projected = project3D(x, y, z, rotation.x, rotation.y);
            const dist = Math.sqrt(x*x + y*y + z*z);
            points.push({ ...projected, dist, orig: {x, y, z} });
          }
        }
      }
    }

    points.sort((a, b) => a.z - b.z);

    points.forEach(p => {
      const screenX = centerX + p.x * scale;
      const screenY = centerY - p.y * scale;
      
      const depthFactor = (p.z + 3) / 6;
      const hue = 200 + n * 10;
      const saturation = 70;
      const lightness = 30 + depthFactor * 40;
      
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.7)`;
      
      const size = 2 + (depthFactor) * 2;
      ctx.beginPath();
      ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // UI overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 280, 140);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('DEPHAZE KERNEL', 20, 30);
    
    ctx.font = '14px monospace';
    ctx.fillText(`Ξ = R / ⁿ√(|x|ⁿ+|y|ⁿ+|z|ⁿ) = 1`, 20, 50);
    
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 280, 140);
    
    ctx.fillStyle = 'rgba(100, 200, 255, 1)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`Order (n) = ${n.toFixed(2)}`, 20, 75);
    ctx.fillText(`Scale (R) = ${R.toFixed(2)}`, 20, 95);
    
    ctx.fillStyle = 'rgba(200, 150, 255, 1)';
    ctx.font = '12px monospace';
    ctx.fillText(`Topology: ${getShapeName(n)}`, 20, 115);
    ctx.fillText(`Resolved Points: ${points.length}`, 20, 135);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(getShapeName(n), width/2, height - 30);
    ctx.textAlign = 'left';
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 600;

    const loop = () => {
      if (animate) {
        setRotation(prev => ({
          x: prev.x,
          y: prev.y + 0.01
        }));
      }
      render(ctx, canvas);
      animationRef.current = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationRef.current);
  }, [n, R, rotation, showGrid, animate]);

  const memory = calculateMemory();

  return (
    <div className="p-6 max-w-6xl mx-auto bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 min-h-screen text-white">
      <div className="mb-6">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
          DEPHAZE Universal Stability Kernel
        </h1>
        <p className="text-gray-300 text-lg font-mono">
          Ξ(x,y,z) = R / ||(x,y,z)||ₙ = 1
        </p>
        <p className="text-gray-400 text-sm mt-2">
          Unified geometric generation using parametric stability coefficients.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-slate-800/50 border border-blue-500/30 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={20} className="text-blue-400" />
            <span className="font-semibold">Performance</span>
          </div>
          <div className="text-2xl font-bold">Real-time</div>
          <div className="text-sm opacity-80">Instant metamorphosis</div>
        </div>

        <div className="bg-slate-800/50 border border-purple-500/30 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Database size={20} className="text-purple-400" />
            <span className="font-semibold">Compression</span>
          </div>
          <div className="text-2xl font-bold">{memory.ratio}</div>
          <div className="text-sm opacity-80">Efficiency vs. Mesh</div>
        </div>

        <div className="bg-slate-800/50 border border-pink-500/30 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Sliders size={20} className="text-pink-400" />
            <span className="font-semibold">Resolution</span>
          </div>
          <div className="text-2xl font-bold">Infinite</div>
          <div className="text-sm opacity-80">Mathematical precision</div>
        </div>
      </div>

      <div className="bg-black/40 rounded-lg p-4 mb-4 border border-slate-700">
        <canvas 
          ref={canvasRef}
          className="w-full rounded cursor-grab active:cursor-grabbing"
          style={{ maxWidth: '800px', display: 'block', margin: '0 auto' }}
          onMouseDown={(e) => {
            const startX = e.clientX;
            const startY = e.clientY;
            const startRot = {...rotation};
            
            const onMove = (e) => {
              const dx = (e.clientX - startX) * 0.005;
              const dy = (e.clientY - startY) * 0.005;
              setRotation({
                x: startRot.x + dy,
                y: startRot.y + dx
              });
            };
            
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-slate-800/80 p-4 rounded-lg border border-slate-700">
          <h3 className="font-semibold mb-3 text-cyan-400 flex items-center gap-2">
            <Sliders size={18} />
            Topological Order (n)
          </h3>
          <input
            type="range"
            min="1"
            max="50"
            step="0.1"
            value={n}
            onChange={(e) => setN(parseFloat(e.target.value))}
            className="w-full mb-2 accent-cyan-500"
          />
          <div className="text-sm text-gray-300 space-y-1 font-mono">
            <div className="flex justify-between">
              <span>n = 1.0</span>
              <span className="text-cyan-400">Octahedron</span>
            </div>
            <div className="flex justify-between">
              <span>n = 2.0</span>
              <span className="text-green-400">Euclidean Sphere</span>
            </div>
            <div className="flex justify-between">
              <span>n = 4.0 - 8.0</span>
              <span className="text-yellow-400">Superquadric</span>
            </div>
            <div className="flex justify-between">
              <span>n → 50.0</span>
              <span className="text-red-400">Limit Cube</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/80 p-4 rounded-lg border border-slate-700">
          <h3 className="font-semibold mb-3 text-purple-400">Scale & Environment</h3>
          
          <label className="block mb-3">
            <span className="text-sm text-gray-300">Radius (R)</span>
            <input
              type="range"
              min="1"
              max="4"
              step="0.1"
              value={R}
              onChange={(e) => setR(parseFloat(e.target.value))}
              className="w-full accent-purple-500"
            />
            <span className="text-xs text-gray-400">Current R: {R.toFixed(2)}</span>
          </label>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="rounded border-slate-700"
              />
              Show Reference Grid
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={animate}
                onChange={(e) => setAnimate(e.target.checked)}
                className="rounded border-slate-700"
              />
              Enable Auto-Rotation
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-red-900/20 p-4 rounded-lg border border-red-500/40">
          <h3 className="font-semibold mb-2 flex items-center gap-2 text-red-400">
            <Database size={18} />
            Standard Method (Mesh)
          </h3>
          <div className="space-y-1 text-sm text-gray-300">
            <div>Data Overhead: <strong>{memory.mesh}</strong></div>
            <div>Resolution: <strong>Finite (faceted)</strong></div>
            <div>Topology: <strong>Fixed Vertex Data</strong></div>
            <div>Transformation: <strong>High Latency</strong></div>
          </div>
        </div>

        <div className="bg-green-900/20 p-4 rounded-lg border border-green-500/40">
          <h3 className="font-semibold mb-2 flex items-center gap-2 text-green-400">
            <Zap size={18} />
            DEPHAZE Protocol
          </h3>
          <div className="space-y-1 text-sm text-gray-300">
            <div>Data Overhead: <strong>{memory.dephaze}</strong></div>
            <div>Resolution: <strong>Infinite (implicit)</strong></div>
            <div>Topology: <strong>Generative Rule-based</strong></div>
            <div>Transformation: <strong>O(1) Real-time</strong></div>
          </div>
        </div>
      </div>

      <div className="bg-indigo-900/20 p-6 rounded-lg border border-indigo-500/40">
        <h3 className="text-xl font-bold mb-3 text-center text-indigo-300">Paradigm Shift Analysis</h3>
        <div className="grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="font-semibold text-red-400/80 mb-2 uppercase tracking-wider">Legacy Systems:</div>
            <ul className="space-y-1 text-gray-400">
              <li>• Explicit vertex storage</li>
              <li>• Resolution-dependent</li>
              <li>• Static topology</li>
              <li>• High storage redundancy</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-green-400/80 mb-2 uppercase tracking-wider">DEPHAZE Framework:</div>
            <ul className="space-y-1 text-gray-400">
              <li>• Algorithmic generation</li>
              <li>• Native infinite resolution</li>
              <li>• Dynamic topological transitions</li>
              <li>• Single shape parameter (n)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-gray-500 text-xs">
        Interaction: Drag to rotate viewport | Adjust Topological Order (n) to modify global stability.
      </div>
    </div>
  );
};

export default DephazeUniversalKernel;
