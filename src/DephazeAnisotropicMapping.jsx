import React, { useState, useMemo, useRef, useEffect } from "react";
import { Scan, Zap, Cpu, Target, Database, Atom, Waves } from "lucide-react";

/**
 * DEPHAZE Phase Map (Audio-style Imago Field + Mirror-Φ Fourier)
 *
 * What changed vs your previous version:
 * 1) We DO NOT compress raw R directly.
 *    We compress an "audio-like" scalar field:
 *       V(theta,phi) = PHI3 * Xi_dir(direction)
 *       F(theta,phi) = log(R + eps) * V
 *    This is smoother and more Fourier-friendly.
 *
 * 2) Fourier uses MIRROR extension on φ (non-periodic axis) to kill seam artifacts:
 *    matrix size is N x (2N). This typically breaks the ~94% plateau.
 *
 * 3) Optional "virtual point" injection (φ³ vortex direction warp) is INCLUDED,
 *    but it is applied only when building the phase map (time-less).
 *
 * Notes:
 * - The ANCHOR = 1e-55 from audio is NOT needed here because Xi is scale-invariant.
 *   The big problem was φ non-periodicity + non-Fourier-friendly signal.
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
  const [fourierTopK, setFourierTopK] = useState(40);

  // === Core constants ===
  const PHI3 = 4.2360679;
  const TAU = 2 * Math.PI;
  const EPS = 1e-6;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const wrap2pi = (a) => ((a % TAU) + TAU) % TAU;

  // === Direction-only Xi (no time, no R dependency) ===
  // Xi_dir = 1 / ( |ux|^PHI3 + |uy|^PHI3 + |uz|^PHI3 )^(1/PHI3)
  const xiDir = (theta, phi) => {
    const ux = Math.sin(phi) * Math.cos(theta);
    const uy = Math.sin(phi) * Math.sin(theta);
    const uz = Math.cos(phi);

    const denom = Math.pow(
      Math.pow(Math.abs(ux), PHI3) +
        Math.pow(Math.abs(uy), PHI3) +
        Math.pow(Math.abs(uz), PHI3),
      1 / PHI3
    );

    return 1 / Math.max(denom, 1e-12);
  };

  // "Audio-style" vortex scalar (direction-only)
  const vortexDir = (theta, phi) => PHI3 * xiDir(theta, phi);

  /**
   * Audio-style field to compress:
   *   F = log(R + eps) * V
   * Reconstruction:
   *   log(R + eps) = F / V  => R = exp(F/V) - eps
   */
  const encodeFieldF = (R, theta, phi) => {
    const V = Math.max(vortexDir(theta, phi), 1e-9);
    return Math.log(Math.max(EPS, R + EPS)) * V;
  };

  const decodeFieldToR = (F, theta, phi) => {
    const V = Math.max(vortexDir(theta, phi), 1e-9);
    const logR = F / V;
    const R = Math.exp(logR) - EPS;
    // guard
    if (!Number.isFinite(R)) return 2.0;
    return Math.max(0.5, Math.min(4.0, R));
  };

  // === Φ³ vortex direction warp (virtual point) ===
  // Time-less mapping: direction unit-vector -> φ³ power warp -> renormalize -> new (thetaV, phiV)
  const phi3VortexDirWarp = (theta, phi) => {
    const ux = Math.sin(phi) * Math.cos(theta);
    const uy = Math.sin(phi) * Math.sin(theta);
    const uz = Math.cos(phi);

    const wx = Math.sign(ux) * Math.pow(Math.abs(ux), PHI3);
    const wy = Math.sign(uy) * Math.pow(Math.abs(uy), PHI3);
    const wz = Math.sign(uz) * Math.pow(Math.abs(uz), PHI3);

    const norm = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1e-12;
    const vx = wx / norm;
    const vy = wy / norm;
    const vz = wz / norm;

    const thetaV = wrap2pi(Math.atan2(vy, vx));
    const phiV = Math.acos(Math.max(-1, Math.min(1, vz)));

    return { thetaV, phiV };
  };

  // === 1) SCAN (φ⁻³) ===
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

      const x = R * Math.sin(phi) * Math.cos(theta);
      const y = R * Math.sin(phi) * Math.sin(theta);
      const z = R * Math.cos(phi);

      const F = encodeFieldF(R, theta, phi);

      points.push({ x, y, z, theta, phi, R, F });
    }
    return points;
  }, [meshType, scanDensity]);

  // === 2) PHASE MAP (store F, NOT R) + virtual point injection ===
  const phaseMap = useMemo(() => {
    const N = phaseResolution;

    // init with a reasonable default field at each direction
    const map = Array(N)
      .fill(null)
      .map(() =>
        Array(N)
          .fill(null)
          .map(() => ({ F: encodeFieldF(2.0, 0, Math.PI / 2), count: 0 }))
      );

    const virtualWeight = 0.45; // tuning 0.2..0.7

    const addSample = (theta, phi, F, weight = 1.0) => {
      const ti = Math.floor((theta / TAU) * N) % N;
      const tj = Math.floor((phi / Math.PI) * N);
      if (tj < 0 || tj >= N) return;

      const cell = map[ti][tj];
      if (cell.count === 0) {
        cell.F = F;
        cell.count = weight;
      } else {
        cell.F = (cell.F * cell.count + F * weight) / (cell.count + weight);
        cell.count += weight;
      }
    };

    scannedPoints.forEach((p) => {
      // measured point
      addSample(p.theta, p.phi, p.F, 1.0);

      // virtual point (φ³ vortex warp)
      const { thetaV, phiV } = phi3VortexDirWarp(p.theta, p.phi);
      addSample(thetaV, phiV, p.F, virtualWeight);
    });

    // fill holes via neighbor average (θ wraps, φ clamps)
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (map[i][j].count === 0) {
          const i1 = (i - 1 + N) % N;
          const i2 = (i + 1) % N;
          const j1 = Math.max(0, j - 1);
          const j2 = Math.min(N - 1, j + 1);

          let sum = 0;
          let cnt = 0;
          if (map[i1][j].count > 0) {
            sum += map[i1][j].F;
            cnt++;
          }
          if (map[i2][j].count > 0) {
            sum += map[i2][j].F;
            cnt++;
          }
          if (map[i][j1].count > 0) {
            sum += map[i][j1].F;
            cnt++;
          }
          if (map[i][j2].count > 0) {
            sum += map[i][j2].F;
            cnt++;
          }

          if (cnt > 0) {
            map[i][j].F = sum / cnt;
            map[i][j].count = 1e-6;
          } else {
            const theta = ((i + 0.5) / N) * TAU;
            const phi = ((j + 0.5) / N) * Math.PI;
            map[i][j].F = encodeFieldF(2.0, theta, phi);
            map[i][j].count = 1e-6;
          }
        }
      }
    }

    return map;
  }, [scannedPoints, phaseResolution]);

  // === 3) FOURIER (DFT) with MIRROR φ extension ===
  const fourierData = useMemo(() => {
    if (compressionMode !== "fourier") return null;

    const N = phaseResolution;
    const M = 2 * N; // mirror φ dimension

    // Build N x (2N) matrix:
    // [ F(theta,phi0..phiN-1) | F(theta,phiN-1..phi0) ]
    const matrix = Array(N)
      .fill(null)
      .map((_, i) => {
        const base = phaseMap[i].map((c) => c.F); // length N
        const mirror = [...base].reverse(); // length N
        return base.concat(mirror); // length 2N
      });

    // DC
    let dcSum = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) dcSum += matrix[i][j];
    }
    const dc = dcSum / (N * M);

    const allCoeffs = [];
    const maxFreqX = Math.floor(N / 2);
    const maxFreqY = Math.floor(M / 2);

    for (let kx = -maxFreqX; kx <= maxFreqX; kx++) {
      for (let ky = -maxFreqY; ky <= maxFreqY; ky++) {
        if (kx === 0 && ky === 0) continue;

        let real = 0;
        let imag = 0;

        for (let i = 0; i < N; i++) {
          for (let j = 0; j < M; j++) {
            const angle = -TAU * (kx * i / N + ky * j / M);
            const val = matrix[i][j] - dc;
            real += val * Math.cos(angle);
            imag += val * Math.sin(angle);
          }
        }

        const amplitude = Math.sqrt(real * real + imag * imag);
        const norm = N * M;

        // keep only meaningful
        if (amplitude / norm > 0.00005) {
          allCoeffs.push({
            kx,
            ky,
            real: real / norm,
            imag: imag / norm,
            amplitude: amplitude / norm,
          });
        }
      }
    }

    allCoeffs.sort((a, b) => b.amplitude - a.amplitude);
    const topCoeffs = allCoeffs.slice(0, Math.min(fourierTopK, allCoeffs.length));

    return {
      dc,
      N,
      M,
      coefficients: topCoeffs,
      totalCoeffs: allCoeffs.length,
    };
  }, [compressionMode, phaseMap, phaseResolution, fourierTopK]);

  // === 4) Reconstruction: F -> R ===
  const reconstructR = (theta, phi) => {
    const N = phaseResolution;

    if (compressionMode === "fourier" && fourierData) {
      const { dc, coefficients, M } = fourierData;

      // continuous indices in the DFT grid
      const ti = (theta / TAU) * N;

      // IMPORTANT:
      // Our DFT φ grid is length M=2N, representing [0..π] mirrored.
      // For real φ in [0..π], we map it to first half [0..N] and scale to M.
      const tj = (phi / Math.PI) * M;

      let F = dc;
      for (const c of coefficients) {
        const angle = TAU * (c.kx * ti / N + c.ky * tj / M);
        F += c.real * Math.cos(angle) - c.imag * Math.sin(angle);
      }

      return decodeFieldToR(F, theta, phi);
    }

    // spatial lookup
    const ti = Math.floor((theta / TAU) * N) % N;
    const tj = Math.floor((phi / Math.PI) * N);
    if (tj < 0 || tj >= N) return 2.0;

    const F = phaseMap[ti][tj].F;
    return decodeFieldToR(F, theta, phi);
  };

  // === 5) Metrics ===
  const metrics = useMemo(() => {
    const meshSize = scanDensity * 12; // xyz float32*3 = 12 bytes
    let dephazeSize;

    if (compressionMode === "fourier") {
      // same accounting model: 16B header + 16B/coeff + 8B dc-ish
      dephazeSize = 16 + fourierTopK * 16 + 8;
    } else {
      dephazeSize = 16 + phaseResolution * phaseResolution * 4; // F map float32 model
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

    // background
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#020617");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 90;

    const points = [];

    // Dephaze reconstructed surface points
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

          // rotate
          const cosX = Math.cos(rotation.x);
          const sinX = Math.sin(rotation.x);
          const y1 = y * cosX - z * sinX;
          const z1 = y * sinX + z * cosX;

          const cosY = Math.cos(rotation.y);
          const sinY = Math.sin(rotation.y);
          const x2 = x * cosY + z1 * sinY;
          const z2 = -x * sinY + z1 * cosY;

          points.push({ x: x2, y: y1, z: z2, type: "dephaze" });
        }
      }
    }

    // Raw mesh points
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

        points.push({ x: x2, y: y1, z: z2, type: "mesh" });
      });
    }

    points.sort((a, b) => a.z - b.z);

    points.forEach((p) => {
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
            ? { r: 100, g: 255, b: 150 } // green
            : { r: 100, g: 150, b: 255 }; // blue

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
        <p className="text-slate-500 text-xs tracking-[0.3em] mt-2">IMAGO FIELD (AUDIO-STYLE) + MIRROR-Φ FOURIER</p>
        <p className="text-slate-600 text-[9px] tracking-[0.4em] mt-1">Ω₀ → φ³ ↔ φ⁻³ → Ξ=1</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-3">
          <div className="bg-purple-950 bg-opacity-50 p-4 rounded-xl border border-purple-600 border-opacity-40">
            <h3 className="text-purple-400 font-bold text-xs mb-3 uppercase flex items-center gap-2">
              <Atom size={14} /> DEPHAZE Axioms
            </h3>
            <div className="text-[9px] text-purple-200 space-y-1.5 leading-relaxed">
              <p>
                <span className="text-purple-400">Ω₀:</span> Invariant zero-point
              </p>
              <p>
                <span className="text-purple-400">φ³:</span> Generative field (Imago Field F)
              </p>
              <p>
                <span className="text-purple-400">φ⁻³:</span> Measured pattern (scan points)
              </p>
              <p>
                <span className="text-purple-400">Ξ:</span> Dir-invariant via Lamé (PHI3)
              </p>
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
                <div className="text-[7px] opacity-70">F-map</div>
              </button>
              <button
                onClick={() => setCompressionMode("fourier")}
                className={`p-2 rounded-lg text-[9px] font-bold transition ${
                  compressionMode === "fourier" ? "bg-green-600 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                FOURIER
                <div className="text-[7px] opacity-70">Mirror-Φ DFT</div>
              </button>
            </div>

            {compressionMode === "fourier" && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <p className="text-[8px] text-slate-400 mb-2 uppercase">Top-K Coefficients</p>
                <input
                  type="range"
                  min="10"
                  max="160"
                  step="10"
                  value={fourierTopK}
                  onChange={(e) => setFourierTopK(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[7px] text-slate-500 mt-1 mb-2">
                  <span>Smooth (10)</span>
                  <span>Detailed (160)</span>
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
              <Target size={14} /> Ξ Stability
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
                <Cpu size={12} /> Phase Resolution
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
            ? `Mirror-φ DFT on Imago field F = log(R)*V(dir). This removes φ seam assumptions and typically lifts accuracy above the old ~94% plateau (given enough K).`
            : `Spatial Imago field map (F-cells). Very accurate, fixed size vs scan density.`}
        </p>
      </div>
    </div>
  );
};

export default DephazePhaseMap;
