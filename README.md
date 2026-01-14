# Dephaze-Topologies
Dephaze-Topologies demonstrates a complexity-invariant, implicit geometry representation where storage size does not scale with geometric detail.

### The obsolescence of polygons. The emergence of implicit topology.

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen?style=for-the-badge)](https://dephaze-topologies.vercel.app/)
[![License](https://img.shields.io/badge/License-Academic-blue?style=for-the-badge)](https://zenodo.org/)

**DEPHAZE is a geometry representation that is not stored as triangles.**
It is resolved locally as a stability field around a zero-point reference (Ω₀).

---

## What this is
- A **working prototype** that demonstrates:
  1) **Primitive implicit topologies** generated from a tiny seed (R, n).
  2) **Abstract / scanned topologies** represented as a phase field and reconstructed with optional Fourier Top-K transport.

## What this is NOT
- Not “mesh compression”.
- Not a new STL.
- Not a magic scanner that creates detail from nothing.
- Not claiming “infinite printer resolution” by itself — physical resolution is always a hardware limit.
- The point is **complexity-invariant representation**, not triangle count.

---

# Part I — Primitive Topologies (Core Kernel)

## Universal Master Formula (Lp / Minkowski family)
Every convex primitive—from spheres to cubes and all hybrids in between—can be expressed as a single stability condition:

\[
\Xi(x, y, z) = \frac{R}{\sqrt[n]{|x|^n + |y|^n + |z|^n}}
\quad,\quad
\Xi = 1 \Rightarrow \text{surface boundary}
\]

- n = 2 → sphere
- n = 1 → octahedron
- n → ∞ → cube (Chebyshev limit)

**Storage:** ~16 bytes (R, n as two scalars in the demo).
**Rendering:** the surface is resolved on-demand from the kernel.

---

# Part II — Abstract Topologies (Scan → Phase Map → Reconstruction)

Real objects are not always closed-form primitives.  
This prototype demonstrates a second pipeline:

### 1) Scan (φ⁻³)
We sample points (or directions) from an object (synthetic in the demo), producing measured geometry.

### 2) Phase Map (Spatial Domain)
Instead of keeping XYZ point clouds, we map measurements into a compact **phase field**:
- phase coordinates: (θ, φ) bins (direction space)
- stored value: a scalar field representing the shape along that direction

In the current demo, we store a **PHI³-Lamé derived warped radius** for better stability:
- warp uses a direction-only Xi factor (no circular dependency)
- then reconstruction unwarps back to radius

### 3) Reconstruction (φ³)
The object is reconstructed from the phase field:
- Spatial mode: direct lookup in the phase map (high accuracy)
- Fourier mode: Top-K frequency coefficients (extreme compression)

---

## Accuracy metric (as shown in the demo)
The UI displays **Ξ Stability %** — a demo-defined metric derived from the average reconstruction error over sampled directions.
It is intended for **relative comparison between modes**, not as a universal metrology standard.

Typical observed results in the demo:
- **Spatial phase map:** ~99–99.9%
- **Fourier Top-K:** ~96–98% depending on K and resolution

---

## Storage scaling (the key result)
### Legacy mesh / point cloud
- Storage grows with the number of samples/triangles and detail.
- High fidelity assets (games/film/print) scale into MB→GB→TB pipelines.

### Dephaze representation
- **Spatial:** storage depends primarily on phase resolution (N² cells), not scan point count.
- **Fourier:** storage depends primarily on Top-K (≈ constant-size coefficients).

Example shown in the UI:
- Mesh (2000 points): ~23.4 KB
- Dephaze Fourier (K=100): ~1624 B

This demonstrates **complexity-invariant transport/storage**, while accuracy remains controllable.

---

# Live Demo
Explore the prototype:
https://dephaze-topologies.vercel.app/

- 3D Interactive Viewer
- Core Validation (primitive equivalences)
- Anisotropic Mapping (abstract scan → phase map → Fourier)

---

# Implementation notes
This repo is a prototype (JS/React). The kernel is designed to be portable to:
- C/C++
- GPU shader (GLSL/HLSL)
- Python
- Rust

Core kernel (primitive Lp family):

```python
def dephaze_kernel(x, y, z, R, n):
    pattern = (abs(x)**n + abs(y)**n + abs(z)**n)**(1/n)
    return R / pattern
