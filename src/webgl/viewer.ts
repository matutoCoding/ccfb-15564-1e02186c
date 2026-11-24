import type { Project, SeasonKey } from '../types.ts';
import { createProgram } from './gl_utils.ts';
import {
  lineFragmentShader,
  lineVertexShader,
  plantFragmentShader,
  plantVertexShader,
  terrainFragmentShader,
  terrainVertexShader
} from './shaders.ts';
import { mat4LookAt, mat4Multiply, mat4Perspective, type Mat4 } from './gl_math.ts';
import { buildLineData, buildTerrainMesh, sampleProjectHeight } from './scene_builder.ts';
import { createTeaPlantGeometry } from './plant_geometry.ts';

export interface ViewerStats { fps: number; instances: number; triangles: number }
export type ScenePickHandler = (point: { x: number; y: number; z: number } | null) => void;

interface CameraState { yaw: number; pitch: number; distance: number; target: [number, number, number] }

const SEASON_COLORS: Record<SeasonKey, { canopy: [number, number, number]; shoot: [number, number, number]; fog: [number, number, number] }> = {
  spring: { canopy: [0.16, 0.43, 0.16], shoot: [0.62, 0.80, 0.25], fog: [0.78, 0.86, 0.82] },
  summer: { canopy: [0.07, 0.30, 0.12], shoot: [0.20, 0.48, 0.16], fog: [0.76, 0.84, 0.82] },
  autumn: { canopy: [0.38, 0.25, 0.10], shoot: [0.82, 0.48, 0.14], fog: [0.86, 0.80, 0.70] },
  winter: { canopy: [0.13, 0.25, 0.19], shoot: [0.38, 0.45, 0.34], fog: [0.80, 0.84, 0.86] }
};

export class TerrainViewer {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  project: Project | null;
  onStats?: (stats: ViewerStats) => void;
  onSceneClick?: ScenePickHandler;
  stressTest = false;

  private terrainProgram: WebGLProgram;
  private lineProgram: WebGLProgram;
  private plantProgram: WebGLProgram;
  private terrainVao: WebGLVertexArrayObject;
  private lineVao: WebGLVertexArrayObject;
  private plantVao: WebGLVertexArrayObject;
  private terrainIndexCount = 0;
  private lineVertexCount = 0;
  private plantInstanceCount = 0;
  private stressInstanceCount = 0;
  private triangleCount = 0;
  private plantVertexCount = 0;

  private camera: CameraState = { yaw: 0.72, pitch: 0.62, distance: 360, target: [0, 24, 0] };
  private raf = 0;
  private lastTime = performance.now();
  private fpsFrames = 0;
  private fpsTime = 0;
  private resizeObserver: ResizeObserver;
  private pointer: { id: number; x: number; y: number; button: number; moved: number } | null = null;
  private disposed = false;
  private marker: [number, number, number] | null = null;
  private markerBuffer: WebGLBuffer;
  private markerVao: WebGLVertexArrayObject;

  constructor(canvas: HTMLCanvasElement, project: Project | null, onStats?: (s: ViewerStats) => void) {
    this.canvas = canvas;
    this.project = project;
    this.onStats = onStats;
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;

    this.terrainProgram = createProgram(gl, terrainVertexShader, terrainFragmentShader);
    this.lineProgram = createProgram(gl, lineVertexShader, lineFragmentShader);
    this.plantProgram = createProgram(gl, plantVertexShader, plantFragmentShader);
    this.terrainVao = gl.createVertexArray()!;
    this.lineVao = gl.createVertexArray()!;
    this.plantVao = gl.createVertexArray()!;
    this.markerVao = gl.createVertexArray()!;
    this.markerBuffer = gl.createBuffer()!;

    this.setupTerrainBuffers();
    this.setupLineBuffers();
    this.setupPlantBuffers();
    this.setupMarkerBuffer();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.setProject(project, true);
    this.loop();
  }

  private setupTerrainBuffers() {
    const gl = this.gl;
    gl.bindVertexArray(this.terrainVao);
    for (const name of ['aPosition', 'aNormal', 'aColor']) {
      const loc = gl.getAttribLocation(this.terrainProgram, name);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    }
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  }

  private setupLineBuffers() {
    const gl = this.gl;
    gl.bindVertexArray(this.lineVao);
    const posLoc = gl.getAttribLocation(this.lineProgram, 'aPosition');
    const colorLoc = gl.getAttribLocation(this.lineProgram, 'aColor');
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
  }

  private setupPlantBuffers() {
    const gl = this.gl;
    const geo = createTeaPlantGeometry();
    gl.bindVertexArray(this.plantVao);
    const bindStatic = (name: string, data: Float32Array, size: number) => {
      const loc = gl.getAttribLocation(this.plantProgram, name);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    bindStatic('aPosition', geo.positions, 3);
    bindStatic('aNormal', geo.normals, 3);
    bindStatic('aPart', geo.parts, 1);

    const instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    const attrs: Array<[string, number, number]> = [
      ['iOffset', 3, 0],
      ['iScale', 1, 12],
      ['iRotation', 1, 16],
      ['iHue', 1, 20]
    ];
    for (const [name, size, offset] of attrs) {
      const loc = gl.getAttribLocation(this.plantProgram, name);
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 24, offset);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.plantVertexCount = geo.vertexCount;
    (this as unknown as { instanceBuffer: WebGLBuffer }).instanceBuffer = instanceBuffer;
  }

  private setupMarkerBuffer() {
    const gl = this.gl;
    gl.bindVertexArray(this.markerVao);
    const loc = gl.getAttribLocation(this.lineProgram, 'aPosition');
    const colorLoc = gl.getAttribLocation(this.lineProgram, 'aColor');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.markerBuffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    const colorBuffer = gl.createBuffer();
    const colors = new Float32Array(36).fill(1);
    for (let i = 3; i < colors.length; i += 4) colors[i] = 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  }

  setMarker(point: [number, number, number] | null) {
    this.marker = point;
    if (!point) return;
    const s = 2.2;
    const [x, y, z] = point;
    const v = new Float32Array([
      x - s, y, z, x + s, y, z,
      x, y - s * 0.4, z, x, y + s * 2.2, z,
      x, y, z - s, x, y, z + s
    ]);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.markerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW);
  }

  setStressTest(enabled: boolean) {
    this.stressTest = enabled;
    this.rebuildPlants();
  }

  private bindEvents() {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  private handleContextMenu = (e: Event) => e.preventDefault();

  private handlePointerDown = (e: PointerEvent) => {
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, button: e.button, moved: 0 };
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.pointer) return;
    const dx = e.clientX - this.pointer.x;
    const dy = e.clientY - this.pointer.y;
    this.pointer.moved += Math.abs(dx) + Math.abs(dy);
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    const speed = 0.0052;
    if (this.pointer.button === 0) {
      this.camera.yaw -= dx * speed;
      this.camera.pitch = Math.min(1.42, Math.max(0.12, this.camera.pitch + dy * speed));
    } else {
      const pan = this.camera.distance * 0.0016;
      this.camera.target[0] -= dx * pan;
      this.camera.target[2] -= dy * pan * Math.cos(this.camera.yaw);
      this.camera.target[1] += dy * pan * Math.sin(this.camera.pitch) * 0.4;
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    const p = this.pointer;
    this.pointer = null;
    if (p && p.moved < 6 && e.button === 0 && this.onSceneClick) {
      this.onSceneClick(this.pick(e.clientX, e.clientY));
    }
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camera.distance = Math.min(20000, Math.max(4, this.camera.distance * Math.exp(e.deltaY * 0.001)));
  };

  resize() {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth ?? window.innerWidth;
    const height = parent?.clientHeight ?? window.innerHeight;
    const dprCap = this.project?.view.quality === 'low' ? 1 : this.project?.view.quality === 'medium' ? 1.35 : 1.75;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setProject(project: Project | null, fit = false) {
    this.project = project;
    this.resize();
    this.rebuildTerrain(fit);
    this.rebuildLines();
    this.rebuildPlants();
  }

  refreshOverlays() {
    this.rebuildLines();
  }

  refreshColors() {
    this.rebuildTerrain(false);
    this.rebuildLines();
  }

  private rebuildTerrain(fit: boolean) {
    const gl = this.gl;
    const mesh = this.project ? buildTerrainMesh(this.project) : null;
    gl.bindVertexArray(this.terrainVao);
    if (!mesh) {
      this.terrainIndexCount = 0;
      return;
    }
    this.uploadAttribute(gl.getAttribLocation(this.terrainProgram, 'aPosition'), mesh.positions, 3);
    this.uploadAttribute(gl.getAttribLocation(this.terrainProgram, 'aNormal'), mesh.normals, 3);
    this.uploadAttribute(gl.getAttribLocation(this.terrainProgram, 'aColor'), mesh.colors, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.terrainIndexCount = mesh.indices.length;
    this.triangleCount = mesh.indices.length / 3;
    if (fit) this.fitCamera();
  }

  private uploadAttribute(location: number, data: Float32Array, size: number) {
    const gl = this.gl;
    if (location < 0) return;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  private rebuildLines() {
    const gl = this.gl;
    const data = this.project ? buildLineData(this.project) : { positions: [], colors: [] };
    this.lineVertexCount = data.positions.length / 3;
    gl.bindVertexArray(this.lineVao);
    this.uploadAttribute(gl.getAttribLocation(this.lineProgram, 'aPosition'), new Float32Array(data.positions), 3);
    this.uploadAttribute(gl.getAttribLocation(this.lineProgram, 'aColor'), new Float32Array(data.colors), 4);
  }

  private rebuildPlants() {
    const gl = this.gl;
    if (!this.project) {
      this.plantInstanceCount = 0;
      return;
    }
    let instances: Float32Array;
    if (this.stressTest) {
      instances = this.buildStressInstances(100000);
      this.stressInstanceCount = 100000;
      this.plantInstanceCount = 100000;
    } else {
      this.stressInstanceCount = 0;
      const plants = this.project.rows?.plants ?? [];
      this.plantInstanceCount = this.project.view.showPlants ? plants.length : 0;
      instances = new Float32Array(plants.length * 6);
      plants.forEach((p, i) => {
        instances[i * 6] = p.x;
        instances[i * 6 + 1] = p.y;
        instances[i * 6 + 2] = p.z;
        instances[i * 6 + 3] = p.scale;
        instances[i * 6 + 4] = (i * 2.39996) % (Math.PI * 2);
        instances[i * 6 + 5] = p.hueShift;
      });
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, (this as unknown as { instanceBuffer: WebGLBuffer }).instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
  }

  private buildStressInstances(count: number): Float32Array {
    const p = this.project!;
    const t = p.terrain!;
    const out = new Float32Array(count * 6);
    const side = Math.ceil(Math.sqrt(count));
    const width = (t.cols - 1) * t.cellX;
    const depth = (t.rows - 1) * t.cellZ;
    for (let i = 0; i < count; i++) {
      const gx = i % side;
      const gz = Math.floor(i / side);
      const x = t.originX + ((gx + 0.37 * ((i * 17) % 11) / 11) / side) * width;
      const z = t.originZ + ((gz + 0.61 * ((i * 29) % 13) / 13) / side) * depth;
      const y = sampleProjectHeight(p, x, z) + 0.02;
      out[i * 6] = x;
      out[i * 6 + 1] = y;
      out[i * 6 + 2] = z;
      out[i * 6 + 3] = 0.72 + ((i * 37) % 30) / 100;
      out[i * 6 + 4] = (i * 2.39996) % 6.283;
      out[i * 6 + 5] = (((i * 13) % 100) / 100 - 0.5) * 0.16;
    }
    return out;
  }

  fitCamera() {
    const t = this.project?.terrain;
    if (!t) return;
    const width = (t.cols - 1) * t.cellX;
    const depth = (t.rows - 1) * t.cellZ;
    this.camera.target = [t.originX + width / 2, (t.minElev + t.maxElev) * 0.42, t.originZ + depth / 2];
    this.camera.distance = Math.max(width, depth) * 1.18;
  }

  private viewProj(): { vp: Mat4; view: Mat4; proj: Mat4; eye: [number, number, number] } {
    const { yaw, pitch, distance, target } = this.camera;
    const cp = Math.cos(pitch);
    const eye: [number, number, number] = [
      target[0] + distance * cp * Math.sin(yaw),
      target[1] + distance * Math.sin(pitch),
      target[2] + distance * cp * Math.cos(yaw)
    ];
    const view = mat4LookAt(eye, target, [0, 1, 0]);
    const proj = mat4Perspective(Math.PI / 4.2, this.canvas.width / this.canvas.height, 0.3, 50000);
    return { vp: mat4Multiply(proj, view), view, proj, eye };
  }

  pick(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const { eye } = this.viewProj();
    const target = this.camera.target;
    let fx = target[0] - eye[0];
    let fy = target[1] - eye[1];
    let fz = target[2] - eye[2];
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;

    let rx = -fz;
    let ry = 0;
    let rz = fx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;

    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;
    const tanFov = Math.tan(Math.PI / 4.2 / 2);
    const aspect = this.canvas.width / this.canvas.height;

    let dx = fx + rx * nx * tanFov * aspect + ux * ny * tanFov;
    let dy = fy + ry * nx * tanFov * aspect + uy * ny * tanFov;
    let dz = fz + rz * nx * tanFov * aspect + uz * ny * tanFov;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;

    const t = this.project?.terrain;
    if (!t || !this.project) return null;
    const step = Math.max(0.35, Math.min(t.cellX, t.cellZ) * 0.9);
    const maxDistance = Math.max(2500, this.camera.distance * 2.4);
    let prevGap = Infinity;
    let prevT = 0;
    for (let dist = 0; dist < maxDistance; dist += step * 2) {
      const x = eye[0] + dx * dist;
      const y = eye[1] + dy * dist;
      const z = eye[2] + dz * dist;
      if (x < t.originX || z < t.originZ || x > t.originX + (t.cols - 1) * t.cellX || z > t.originZ + (t.rows - 1) * t.cellZ) continue;
      const ground = sampleProjectHeight(this.project, x, z);
      const gap = y - ground;
      if (gap <= 0 && prevGap > 0) {
        let lo = prevT;
        let hi = dist;
        for (let i = 0; i < 9; i++) {
          const mid = (lo + hi) / 2;
          const mx = eye[0] + dx * mid;
          const my = eye[1] + dy * mid;
          const mz = eye[2] + dz * mid;
          const mg = sampleProjectHeight(this.project, mx, mz);
          if (my > mg) lo = mid; else hi = mid;
        }
        const hitT = (lo + hi) / 2;
        const x2 = eye[0] + dx * hitT;
        const z2 = eye[2] + dz * hitT;
        return { x: x2, y: sampleProjectHeight(this.project, x2, z2), z: z2 };
      }
      prevGap = gap;
      prevT = dist;
    }
    return null;
  }

  private loop = () => {
    if (this.disposed) return;
    this.render();
    const now = performance.now();
    this.fpsFrames++;
    this.fpsTime += now - this.lastTime;
    this.lastTime = now;
    if (this.fpsTime >= 600) {
      const fps = Math.round((this.fpsFrames * 1000) / this.fpsTime);
      const plantTriangles = (this.plantVertexCount / 3) * this.plantInstanceCount;
      this.onStats?.({
        fps,
        instances: this.stressTest ? this.stressInstanceCount : this.plantInstanceCount,
        triangles: this.triangleCount + plantTriangles
      });
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private render() {
    const gl = this.gl;
    const season = this.project?.season.season ?? 'spring';
    const colors = SEASON_COLORS[season];
    gl.clearColor(colors.fog[0] * 0.82, colors.fog[1] * 0.88, colors.fog[2] * 0.88, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    const { vp, eye } = this.viewProj();
    const fogEnabled = this.project?.season.fogEnabled ?? true;
    const fogDensity = fogEnabled ? (this.project?.season.fogDensity ?? 0.004) : 0;
    const mist = fogEnabled ? (this.project?.season.morningMist ?? 0.4) : 0;
    const terrain = this.project?.terrain;
    const mistBottom = terrain ? terrain.minElev + 2 : 0;
    const mistTop = terrain ? terrain.minElev + Math.max(18, (terrain.maxElev - terrain.minElev) * 0.38) : 30;
    const azimuth = ((this.project?.season.sunAzimuth ?? 135) * Math.PI) / 180;
    const height = ((this.project?.season.sunHeight ?? 42) * Math.PI) / 180;
    const sun: [number, number, number] = [Math.cos(height) * Math.sin(azimuth), Math.sin(height), Math.cos(height) * Math.cos(azimuth)];

    if (this.terrainIndexCount) {
      gl.useProgram(this.terrainProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.terrainProgram, 'uViewProj'), false, vp);
      gl.uniform3fv(gl.getUniformLocation(this.terrainProgram, 'uCamera'), eye);
      gl.uniform3fv(gl.getUniformLocation(this.terrainProgram, 'uSunDir'), sun);
      gl.uniform3fv(gl.getUniformLocation(this.terrainProgram, 'uFogColor'), colors.fog);
      gl.uniform1f(gl.getUniformLocation(this.terrainProgram, 'uFogDensity'), fogDensity);
      gl.uniform1f(gl.getUniformLocation(this.terrainProgram, 'uMist'), mist);
      gl.uniform1f(gl.getUniformLocation(this.terrainProgram, 'uMistBottom'), mistBottom);
      gl.uniform1f(gl.getUniformLocation(this.terrainProgram, 'uMistTop'), mistTop);
      gl.uniform1f(gl.getUniformLocation(this.terrainProgram, 'uTime'), performance.now() / 1000);
      gl.bindVertexArray(this.terrainVao);
      gl.drawElements(gl.TRIANGLES, this.terrainIndexCount, gl.UNSIGNED_INT, 0);
    }

    if (this.plantInstanceCount && this.project?.view.showPlants !== false || this.stressTest) {
      if (this.plantInstanceCount > 0) {
        gl.useProgram(this.plantProgram);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.plantProgram, 'uViewProj'), false, vp);
        gl.uniform3fv(gl.getUniformLocation(this.plantProgram, 'uCamera'), eye);
        gl.uniform3fv(gl.getUniformLocation(this.plantProgram, 'uSunDir'), sun);
        gl.uniform3fv(gl.getUniformLocation(this.plantProgram, 'uCanopyColor'), colors.canopy);
        gl.uniform3fv(gl.getUniformLocation(this.plantProgram, 'uShootColor'), colors.shoot);
        gl.uniform3fv(gl.getUniformLocation(this.plantProgram, 'uTrunkColor'), [0.34, 0.22, 0.13]);
        gl.uniform3fv(gl.getUniformLocation(this.plantProgram, 'uFogColor'), colors.fog);
        gl.uniform1f(gl.getUniformLocation(this.plantProgram, 'uFogDensity'), fogDensity * 1.1);
        gl.uniform1f(gl.getUniformLocation(this.plantProgram, 'uMist'), mist);
        gl.uniform1f(gl.getUniformLocation(this.plantProgram, 'uMistBottom'), mistBottom);
        gl.uniform1f(gl.getUniformLocation(this.plantProgram, 'uMistTop'), mistTop);
        gl.bindVertexArray(this.plantVao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.plantVertexCount, this.plantInstanceCount);
      }
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    if (this.lineVertexCount) {
      gl.useProgram(this.lineProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProgram, 'uViewProj'), false, vp);
      gl.uniform3fv(gl.getUniformLocation(this.lineProgram, 'uFogColor'), colors.fog);
      gl.uniform1f(gl.getUniformLocation(this.lineProgram, 'uFogDensity'), fogDensity);
      gl.uniform3fv(gl.getUniformLocation(this.lineProgram, 'uCamera'), eye);
      gl.bindVertexArray(this.lineVao);
      gl.drawArrays(gl.LINES, 0, this.lineVertexCount);
    }
    if (this.marker) {
      gl.useProgram(this.lineProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProgram, 'uViewProj'), false, vp);
      gl.bindVertexArray(this.markerVao);
      gl.drawArrays(gl.LINES, 0, 6);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
