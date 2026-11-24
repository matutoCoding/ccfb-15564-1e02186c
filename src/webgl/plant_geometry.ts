export interface PlantGeometry {
  positions: Float32Array;
  normals: Float32Array;
  parts: Float32Array;
  vertexCount: number;
}

function icosahedronFaces(): Array<[number, number, number]> {
  const t = (1 + Math.sqrt(5)) / 2;
  const vertices = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ].map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  const faces: Array<[number, number, number]> = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  return faces.map((f) => f as [number, number, number]);
}

export function createTeaPlantGeometry(): PlantGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const parts: number[] = [];
  const icoFaces = icosahedronFaces();
  const icoVertices = [
    [-0.5257, 0.8507, 0], [0.5257, 0.8507, 0], [-0.5257, -0.8507, 0], [0.5257, -0.8507, 0],
    [0, -0.5257, 0.8507], [0, 0.5257, 0.8507], [0, -0.5257, -0.8507], [0, 0.5257, -0.8507],
    [0.8507, 0, -0.5257], [0.8507, 0, 0.5257], [-0.8507, 0, -0.5257], [-0.8507, 0, 0.5257]
  ];

  const addLobe = (cx: number, cy: number, cz: number, radius: number) => {
    for (const [ia, ib, ic] of icoFaces) {
      for (const idx of [ia, ib, ic]) {
        const n = icoVertices[idx];
        positions.push(cx + n[0] * radius, cy + n[1] * radius, cz + n[2] * radius);
        normals.push(n[0], n[1], n[2]);
        parts.push(0);
      }
    }
  };

  addLobe(0, 0.52, 0, 0.34);
  addLobe(-0.19, 0.43, 0.08, 0.25);
  addLobe(0.18, 0.44, -0.08, 0.26);

  const sides = 5;
  const radius = 0.045;
  const y0 = 0;
  const y1 = 0.42;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const p0 = [Math.cos(a0) * radius, y0, Math.sin(a0) * radius];
    const p1 = [Math.cos(a1) * radius, y0, Math.sin(a1) * radius];
    const p2 = [Math.cos(a0) * radius * 0.72, y1, Math.sin(a0) * radius * 0.72];
    const p3 = [Math.cos(a1) * radius * 0.72, y1, Math.sin(a1) * radius * 0.72];
    const n0 = [Math.cos(a0), 0.15, Math.sin(a0)];
    const n1 = [Math.cos(a1), 0.15, Math.sin(a1)];
    const tri = [p0, p2, p3, p0, p3, p1];
    const ns = [n0, n0, n1, n0, n1, n1];
    tri.forEach((p, k) => {
      positions.push(p[0], p[1], p[2]);
      const n = ns[k];
      normals.push(n[0], n[1], n[2]);
      parts.push(1);
    });
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    parts: new Float32Array(parts),
    vertexCount: positions.length / 3
  };
}
