import React, { useState, useMemo, useRef, useEffect } from "react";
import { Scan, Zap, Cpu, Target, Database, Atom, Waves } from "lucide-react";

/**
 * DEPHAZE Phase Map — φ³ SPACE + LOG-DOMAIN PROJECTION (Mode 2)
 *
 * Core idea (as you defined):
 * - xyz scan points are a "false edge" (φ⁻³).
 * - We do NOT compute in xyz-space.
 * - We map every direction (θ,φ) into a φ³ vortex space (θφ3, φφ3).
 * - In φ³-space we store/compress the "true" field in LOG domain:
 *     log r' = log r + Δφ3
 *   Operationally: we reconstruct logR in φ³ space and use it as corrected log radius.
 *
 * Compression:
 * - φ is not periodic → use DCT-II along φφ3
 * - θ is periodic → use complex Fourier along θφ3
 * - Top-K coefficients kept
 *
 * Deterministic, time-less mapping.
 */

const DephazePhaseMap = () => {
  const canvasRef = useRef(null);

  // UI state
  const [rotation, setRotation] = useState({ x: 0.8, y: 0.5 });
  const [phaseResolution, setPhaseResolution] = useState(32);
  const [scanDensity, setScanDensity] = useState(500);
  const [meshType, setMeshType] = useState("bumpy");
  const [viewMode, setViewMode] = useState("both");
  const [compressionMode, setCompressionMode] = useState("spatial"); // 'spatial' or 'fourier'
  const [fourierTopK, setFourierTopK] = useState(80);

  // Constants
  const PHI3 = 4.2360679;
  const TAU = 2 * Math.PI;
  const EPS = 1e-9;

  const wrap2pi = (a) => ((a % TAU) + TAU) % TAU;

  // φ³ vortex direction warp: (θ,φ) -> (θφ3, φφ3)
  // This defines the φ³-space coordinates (time-less).
  const phi3VortexDirWarp = (theta, phi) => {
    // unit direction in xyz
    const ux = Math.sin(phi) * Math.cos(theta);
    const uy = Math.sin(phi) * Math.sin(theta);
    const uz = Math.cos(phi);

    // φ³ warp in components (symmetry break / vortex-space embedding)
    const wx = Math.sign(ux) * Math.pow(Math.abs(ux), PHI3);
    const wy = Math.sign(uy) * Math.pow(Math.abs(uy), PHI3);
    const wz = Math.sign(uz) * Math.pow(Math.abs(uz), PHI3);

    // normalize back to unit direction in φ³-space
    const norm = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1e-12;
    const vx = wx / norm;
    const vy = wy / norm;
    const vz = wz / norm;

    const thetaP = wrap2pi(Math.atan2(vy, vx));
    const phiP = Math.acos(Math.max(-1, Math.min(1, vz)));

    return { thetaP, phiP };
  };

  // LOG-domain encode/decode
  const toLogR = (R) => Math.log(Math.max(EPS, R + EPS));
  const fromLogR = (logR) => {
    const R = Math.exp(logR) - EPS;
    if (!Number.isFinite(R)) return 2.0;
    return Math.max(0.5, Math.min(4.0, R));
  };

  // === 1) SCAN (φ⁻³) ===
  // We still generate "true" R for evaluation, but treat xyz as false edge input.
  const scannedPoints = useMemo(() => {
    const points = [];
    for (let i = 0; i < scanDensity; i++) {
      const theta = Math.random() * TAU;
      const phi = Math.random() * Math.PI;

      let R = 2.0;

      if (meshType === "bumpy") {
        R += 0.35 * Math.sin(theta * 3) * Math.cos(phi * 2);
        R += 0.25 * Math.sin(theta * 5 + phi * 3);
      } else if (meshType === "spike") {
        R += 0.6 * Math.abs(Math.sin(theta * 2)) * Math.abs(Math.cos(phi * 2));
      } else {
        R += 0.3 * Math.sin(theta * 2.3 + phi * 1.7);
        R += 0.15 * Math.cos(theta * 4.1) * Math.sin(phi * 3.3);
      }

      // false-edge xyz (observable)
      const x = R * Math.sin(phi) * Math.cos(theta);
      const y = R * Math.sin(phi) * Math.sin(theta);
      const z = R * Math.cos(phi);

      // φ³-space coords (true space)
      const { thetaP, phiP } = phi3VortexDirWarp(theta, phi);

      const logR = toLogR(R);

      points.push({ x, y, z, theta, phi, R, logR, thetaP, phiP });
    }
    return points;
  }, [meshType, scanDensity]);

  // === 2) PHASE MAP IN φ³-SPACE (store logR) ===
  const phaseMap = useMemo(() => {
    const N = phaseResolution;

    // default logR for R=2.0
    const defaultLogR = toLogR(2.0);

    const map = Array(N)
      .fill(null)
      .map(() =>
        Array(N)
          .fill(null)
          .map(() => ({ logR: defaultLogR, count: 0 }))
      );

    // optional: virtual injection weight (kept small; φ³-space already does the heavy lifting)
    const virtualWeight = 0.2;

    const addSample = (thetaP, phiP, logR, weight = 1.0) => {
      const ti = Math.floor((thetaP / TAU) * N) % N;
      const tj = Math.floor((phiP / Math.PI) * N);
      if (tj < 0 || tj >= N) return;

      const cell = map[ti][tj];
      if (cell.count === 0) {
        cell.logR = logR;
        cell.count = weight;
      } else {
        cell.logR =
          (cell.logR * cell.count + logR * weight) / (cell.count + weight);
        cell.count += weight;
      }
    };

    // measured points in φ³-space
    scannedPoints.forEach((p) => {
      addSample(p.thetaP, p.phiP, p.logR, 1.0);

      // virtual point: one extra φ³ "pull" direction (a second warp pass)
      // this is deterministic and time-less: warp φ³ coords again
      const v2 = phi3VortexDirWarp(p.thetaP, p.phiP);
      addSample(v2.thetaP, v2.phiP, p.logR, virtualWeight);
    });

    // fill empty cells (θ wraps, φ clamps)
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (map[i][j].count === 0) {
          const i1 = (i - 1 + N) % N;
          const i2 = (i + 1) % N;
          const j1 = Math.max(0, j - 1);
          const j2 = Math.min(N - 1, j + 1);

          let sum = 0;
          let cnt = 0;

          if (map[i1][j].count > 0) { sum += map[i1][j].logR; cnt++; }
          if (map[i2][j].count > 0) { sum += map[i2][j].logR; cnt++; }
          if (map[i][j1].count > 0) { sum += map[i][j1].logR; cnt++; }
          if (map[i][j2].count > 0) { sum += map[i][j2].logR; cnt++; }

          if (cnt > 0) {
            map[i][j].logR = sum / cnt;
            map[i][j].count = 1e-6;
          } else {
            map[i][j].logR = defaultLogR;
            map[i][j].count = 1e-6;
          }
        }
      }
    }

    return map;
  }, [scannedPoints, phaseResolution]);

  // === 3) FOURIER (θ periodic) × DCT-II (φ non-periodic) on φ³-space logR field ===
  const fourierData = useMemo(() => {
    if (compressionMode !== "fourier") return null;

    const N = phaseResolution;
    const matrix = phaseMap.map((row) => row.map((c) => c.logR));

    // DC
    let dcSum = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) dcSum += matrix[i][j];
    const dc = dcSum / (N * N);

    const allCoeffs = [];

    const maxFreqTheta = Math.floor(N / 2);
    const maxFreqPhi = N - 1;

    // precompute cos(phi) basis for DCT
    const cosPhi = Array(maxFreqPhi + 1)
      .fill(null)
      .map((_, k) =>
        Array(N)
          .fill(0)
          .map((__, j) => Math.cos(Math.PI * k * (j + 0.5) / N))
      );

    for (let kTheta = -maxFreqTheta; kTheta <= maxFreqTheta; kTheta++) {
      for (let kPhi = 0; kPhi <= maxFreqPhi; kPhi++) {
        if (kTheta === 0 && kPhi === 0) continue;

        let real = 0;
        let imag = 0;

        for (let i = 0; i < N; i++) {
          const ang = -TAU * (kTheta * i / N);
          const cT = Math.cos(ang);
          const sT = Math.sin(ang);

          for (let j = 0; j < N; j++) {
            const val = matrix[i][j] - dc;
            const bP = cosPhi[kPhi][j];

            real += val * cT * bP;
            imag += val * sT * bP;
          }
        }

        // normalize
        const norm = N * N;
        const r = real / norm;
        const im = imag / norm;
        const amp = Math.sqrt(r * r + im * im);

        if (amp > 0.00002) {
          allCoeffs.push({
            kTheta,
            kPhi,
            real: r,
            imag: im,
            amplitude: amp,
          });
        }
      }
    }

    allCoeffs.sort((a, b) => b.amplitude - a.amplitude);
    const top = allCoeffs.slice(0, Math.min(fourierTopK, allCoeffs.length));

    return {
      dc,
      N,
      coefficients: top,
      totalCoeffs: allCoeffs.length,
    };
  }, [compressionMode, phaseMap, phaseResolution, fourierTopK]);

  // === 4) Reconstruction in φ³-space, then output corrected R' (log-domain) ===
  const reconstructR = (theta, phi) => {
    const N = phaseResolution;

    // project query direction into φ³-space (the real space)
    const { thetaP, phiP } = phi3VortexDirWarp(theta, phi);

    if (compressionMode === "fourier" && fourierData) {
      const { dc, coefficients } = fourierData;

      const ti = (thetaP / TAU) * N;
      const tj = (phiP / Math.PI) * N;

      let logR = dc;

      for (const c of coefficients) {
        const ang = TAU * (c.kTheta * ti / N);
        const cT = Math.cos(ang);
        const sT = Math.sin(ang);

        const bP = Math.cos(Math.PI * c.kPhi * (tj + 0.5) / N);

        // add contribution
        logR += (c.real * cT - c.imag * sT) * bP;
      }

      return fromLogR(logR);
    }

    // spatial
    const ti = Math.floor((thetaP / TAU) * N) % N;
    const tj = Math.floor((phiP / Math.PI) * N);
    if (tj < 0 || tj >= N) return 2.0;

    return fromLogR(phaseMap[ti][tj].logR);
  };

  // === 5) Metrics ===
  const metrics = useMemo(() => {
    const meshSize = scanDensity * 12;

    let dephazeSize;
    if (compressionMode === "fourier") {
      dephazeSize = 16 + fourierTopK * 16 + 8;
    } else {
      dephazeSize = 16 + phaseResolution * phaseResolution * 4;
    }

    let errorSum = 0;
    for (const p of scannedPoints) {
      const r2 = reconstructR(p.theta, p.phi);
      errorSum += Math.abs(r2 - p.R);
    }

    const avgError = errorSum / Math.max(1, scannedPoints.length);
    const xiStability = Math.max(0, 100 - avgError * 50);

    return {
      meshSize,
      dephazeSize,
      ratio: (meshSize / dephazeSize).toFixed(1),
      xiStability: xiStability.toFixed(1),
      avgError: (avgError * 100).toFixed(2),
      compressionVsMesh: (meshSize / dephazeSize).toFixed(0),
    };
  }, [scannedPoints, phaseMap, phaseResolution, scanDensity, compressionMode, fourierTopK, fourierData]);

  // === 6) Renderer ===
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = (canvas.width = 600);
    const height = (canvas.height = 600);

    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#020617");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 90;
    const pts = [];

    // reconstructed dephaze points
    if (viewMode !== "mesh") {
      const res = 42;
      for (let i = 0; i <= res; i++) {
        const theta = (i / res) * TAU;
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

          pts.push({ x: x2, y: y1, z: z2, type: "dephaze" });
        }
      }
    }

    // scanned mesh points
    if (viewMode !== "dephaze") {
      scannedPoints.slice(0, 250).forEach((p) => {
        const cosX = Math.cos(rotation.x);
        const sinX = Math.sin(rotation.x);
        const y1 = p.y * cosX - p.z * sinX;
        const z1 = p.y * sinX + p.z * cosX;

        const cosY = Math.cos(rotation.y);
        const sinY = Math.sin(rotation.y);
        const x2 = p.x * cosY + z1 * sinY;
        const z2 = -p.x * sinY + z1 * cosY;

        pts.push({ x: x2, y: y1, z: z2, type: "mesh" });
      });
    }

    pts.sort((a, b) => a.z - b.z);

    pts.forEach((p) => {
      const depth = (p.z + 3.5) / 7;

      if (p.type === "mesh") {
        ctx.fillStyle = `rgba(255, 60, 60, ${0.5 + depth * 0.4})`;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 2.5 + depth * 1.5, 0, TAU);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 100, 100, ${0.2 + depth * 0.2})`;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 4 + depth * 2, 0, TAU);
        ctx.fill();
      } else {
        const color =
          compressionMode === "fourier"
            ? { r: 100, g: 255, b: 150 }
            : { r: 100, g: 150, b: 255 };

        const brightness = depth;
        ctx.fillStyle = `rgba(${color.r * brightness}, ${color.g * brightness}, ${color.b}, ${0.4 + depth * 0.5})`;
        ctx.beginPath();
        ctx.arc(centerX + p.x * scale, centerY - p.y * scale, 1.5 + depth * 1.2, 0, TAU);
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
        <p className="text-slate-500 text-xs tracking-[0.3em] mt-2">φ³ SPACE + LOG PROJECTION (MODE 2)</p>
        <p className="text-slate-600 text-[9px] tracking-[0.4em] mt-1">Ω₀ → φ³ ↔ φ⁻³ → Ξ=1</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-3">
          <div className="bg-purple-950 bg-opacity-50 p-4 rounded-xl border border-purple-600 border-opacity-40">
            <h3 className="text-purple-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Atom size={14} /> DEPHAZE Axioms
            </h3>
            <div className="text-[9px] text-purple-200 space-y-1.5 leading-relaxed">
              <p><span className="text-purple-400">Ω₀:</span> 0 reference anchor</p>
              <p><span className="text-purple-400">φ³:</span> Real space (vortex-warped direction)</p>
              <p><span className="text-purple-400">φ⁻³:</span> Scan edge (xyz) – input only</p>
              <p><span className="text-purple-400">Mode 2:</span> log r' = log r + Δφ³</p>
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-red-500 border-opacity-40">
            <h3 className="text-red-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Database size={14} /> MESH (φ⁻³)
            </h3>
            <div className="bg-black bg-opacity-50 p-3 rounded-lg mb-2">
              <p className="text-[8px] text-slate-500 uppercase tracking-wider">Storage</p>
              <p className="text-2xl font-black text-red-500">{(metrics.meshSize / 1024).toFixed(1)} KB</p>
            </div>
            <div className="bg-black bg-opacity-50 p-3 rounded-lg">
              <p className="text-[8px] text-slate-500 uppercase tracking-wider">Points</p>
              <p className="text-xl font-bold text-white">{scanDensity}</p>
            </div>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-amber-500 border-opacity-40">
            <h3 className="text-amber-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Waves size={14} /> Compression Mode
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setCompressionMode("spatial")}
                className={`p-2 rounded-lg text-[9px] font-bold transition ${
                  compressionMode === "spatial" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                SPATIAL
                <div className="text-[7px] opacity-70">φ³ logR-map</div>
              </button>
              <button
                onClick={() => setCompressionMode("fourier")}
                className={`p-2 rounded-lg text-[9px] font-bold transition ${
                  compressionMode === "fourier" ? "bg-green-600 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                FOURIER
                <div className="text-[7px] opacity-70">θ Fourier × φ DCT</div>
              </button>
            </div>

            {compressionMode === "fourier" && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <p className="text-[8px] text-slate-400 mb-2 uppercase">Top-K Coefficients</p>
                <input
                  type="range"
                  min="20"
                  max="220"
                  step="10"
                  value={fourierTopK}
                  onChange={(e) => setFourierTopK(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[7px] text-slate-500 mt-1 mb-2">
                  <span>20</span>
                  <span>220</span>
                </div>
                <p className="text-center text-lg font-bold text-green-400">K = {fourierTopK}</p>
                {fourierData && (
                  <p className="text-center text-[7px] text-slate-500 mt-1">{fourierData.totalCoeffs} available</p>
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
                {compressionMode === "fourier"
                  ? `${metrics.dephazeSize.toFixed(0)} B`
                  : `${(metrics.dephazeSize / 1024).toFixed(1)} KB`}
              </p>
            </div>
            <div className="bg-black bg-opacity-50 p-3 rounded-lg">
              <p className="text-[8px] text-slate-500 uppercase tracking-wider">Method</p>
              <p className="text-sm font-bold text-white">
                {compressionMode === "fourier" ? `${fourierTopK} coeffs` : `${phaseResolution}² cells`}
              </p>
            </div>
          </div>

          <div className="bg-emerald-950 bg-opacity-50 p-4 rounded-xl border border-emerald-600 border-opacity-50">
            <h3 className="text-emerald-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Target size={14} /> Stability
            </h3>
            <div className="text-center mb-3">
              <p className="text-4xl font-black text-white">{metrics.xiStability}%</p>
              <p className="text-[8px] text-slate-500 mt-1">Error: {metrics.avgError}%</p>
            </div>
            <div className="text-center pt-3 border-t border-emerald-800">
              <p className={`text-4xl font-black ${compressionMode === "fourier" ? "text-green-400" : "text-emerald-400"}`}>
                {metrics.compressionVsMesh}×
              </p>
              <p className="text-[8px] text-slate-400 uppercase tracking-wider">vs Mesh</p>
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
                <div
                  className={`w-3 h-3 rounded-full shadow-lg ${
                    compressionMode === "fourier" ? "bg-green-500 shadow-green-500/50" : "bg-blue-500 shadow-blue-500/50"
                  }`}
                />
                <span className={`text-[9px] uppercase ${compressionMode === "fourier" ? "text-green-300" : "text-blue-300"}`}>
                  φ³ {compressionMode === "fourier" ? "Fourier" : "Spatial"}
                </span>
              </div>
            </div>

            <div className="absolute top-4 right-4 flex gap-1 z-10">
              <button
                onClick={() => setViewMode("mesh")}
                className={`px-3 py-1.5 text-[9px] font-bold rounded transition ${
                  viewMode === "mesh" ? "bg-red-600" : "bg-slate-800 hover:bg-slate-700"
                }`}
              >
                φ⁻³
              </button>
              <button
                onClick={() => setViewMode("dephaze")}
                className={`px-3 py-1.5 text-[9px] font-bold rounded transition ${
                  viewMode === "dephaze" ? "bg-blue-600" : "bg-slate-800 hover:bg-slate-700"
                }`}
              >
                φ³
              </button>
              <button
                onClick={() => setViewMode("both")}
                className={`px-3 py-1.5 text-[9px] font-bold rounded transition ${
                  viewMode === "both" ? "bg-purple-600" : "bg-slate-800 hover:bg-slate-700"
                }`}
              >
                BOTH
              </button>
            </div>

            <canvas
              ref={canvasRef}
              onMouseMove={(e) => {
                if (e.buttons === 1) {
                  setRotation({
                    x: rotation.x + e.movementY * 0.007,
                    y: rotation.y + e.movementX * 0.007,
                  });
                }
              }}
              className="cursor-grab active:cursor-grabbing w-full rounded-lg"
            />

            <p className="text-center text-[8px] text-slate-500 mt-2 uppercase tracking-wider">Drag to rotate</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 bg-opacity-70 p-4 rounded-xl border border-purple-500 border-opacity-30">
              <h3 className="text-purple-400 text-[10px] mb-3 uppercase flex items-center gap-2 font-bold">
                <Cpu size={12} /> φ³ Phase Resolution
              </h3>
              <input
                type="range"
                min="16"
                max="64"
                step="8"
                value={phaseResolution}
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
                type="range"
                min="200"
                max="4000"
                step="200"
                value={scanDensity}
                onChange={(e) => setScanDensity(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg"
              />
              <div className="text-center mt-3">
                <p className="text-2xl font-black text-white">{scanDensity}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {["bumpy", "spike", "organic"].map((type) => (
              <button
                key={type}
                onClick={() => setMeshType(type)}
                className={`p-3 rounded-lg text-[10px] font-bold uppercase transition ${
                  meshType === type
                    ? "bg-gradient-to-br from-purple-600 to-purple-800 text-white shadow-lg"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                <div className="text-lg mb-1">{type === "bumpy" ? "🌊" : type === "spike" ? "⚡" : "🧬"}</div>
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-slate-900 bg-opacity-50 p-4 rounded-lg border border-slate-700">
        <p className="text-[9px] text-slate-400 text-center leading-relaxed">
          <span className={compressionMode === "fourier" ? "text-green-400" : "text-purple-400"}>
            {compressionMode === "fourier" ? "🌊 FOURIER MODE:" : "📊 SPATIAL MODE:"}
          </span>{" "}
          {compressionMode === "fourier"
            ? `We compress logR in φ³-space using θ Fourier × φ DCT. This avoids the “xyz false edge” fitting and targets φ³ projection directly.`
            : `Spatial φ³ logR map (no Fourier). This is the direct φ³-space projection representation.`}
        </p>
      </div>
    </div>
  );
};

export default DephazePhaseMap;
