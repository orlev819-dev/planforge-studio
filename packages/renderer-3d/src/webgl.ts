/**
 * Lightweight WebGL renderer for MeshPart lists (orbit / top / iso / first-person cameras, picking,
 * transparent-wall mode). Buffers are cached by part.key so unchanged geometry is never re-uploaded.
 * Written against WebGL1 (+OES_element_index_uint) so it also runs where WebGL2 is unavailable.
 */
import type { MeshPart } from './mesh';
import { meshBounds } from './mesh';

type M4 = Float32Array;
const m4 = {
  perspective(fovy: number, aspect: number, near: number, far: number): M4 {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far), o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf; return o;
  },
  ortho(l: number, r: number, b: number, t: number, n: number, f: number): M4 {
    const o = new Float32Array(16);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o;
  },
  lookAt(e: number[], c: number[], up: number[]): M4 {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const o = new Float32Array(16);
    o[0] = xx; o[1] = yx; o[2] = zx; o[4] = xy; o[5] = yy; o[6] = zy; o[8] = xz; o[9] = yz; o[10] = zz;
    o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); o[15] = 1;
    return o;
  },
  mul(a: M4, b: M4): M4 {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
    return o;
  },
};

const VS = `attribute vec3 aPos; attribute vec3 aNor; uniform mat4 uMVP; varying vec3 vN; varying vec3 vP;
void main(){ vN = aNor; vP = aPos; gl_Position = uMVP * vec4(aPos,1.0); }`;
const FS = `precision mediump float; varying vec3 vN; varying vec3 vP;
uniform vec4 uColor; uniform vec3 uLight; uniform float uPick; uniform float uHi; uniform float uTwo;
uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uGround; uniform float uExposure; uniform float uEmissive;
void main(){
  if (uPick > 0.5) { gl_FragColor = uColor; return; }
  vec3 n = normalize(vN);
  if (uTwo > 0.5 && !gl_FrontFacing) n = -n;
  vec3 L = normalize(uLight);
  float d = max(dot(n, L), 0.0);
  float fill = max(dot(n, normalize(vec3(-L.x, 0.45, -L.z))), 0.0);
  // hemispheric ambient: sky above, bounced floor light below — stands in for ambient occlusion
  float hemi = 0.5 + 0.5 * n.y;
  vec3 ambient = mix(uGround, uSky, hemi);
  vec3 c = uColor.rgb * (ambient + uSun * (0.78 * d + 0.22 * fill));
  c = mix(c, uColor.rgb * 1.6 + vec3(0.12), uEmissive);
  c = c * uExposure;
  c = c / (c + vec3(0.9));                 // soft shoulder, so bright finishes do not clip
  c = pow(c, vec3(1.0 / 1.25));
  c = mix(c, vec3(0.2, 0.55, 1.0), uHi * 0.45);
  gl_FragColor = vec4(c, uColor.a);
}`;

/** Daylight presets: sun direction and colour, sky and bounce ambient, exposure. */
export type SceneLight = 'morning' | 'day' | 'evening' | 'night';
export const SCENE_LIGHTS: Record<SceneLight, { dir: [number, number, number]; sun: [number, number, number]; sky: [number, number, number]; ground: [number, number, number]; exposure: number; bg: [number, number, number] }> = {
  morning: { dir: [0.75, 0.42, 0.5], sun: [1.02, 0.9, 0.72], sky: [0.3, 0.33, 0.38], ground: [0.16, 0.15, 0.14], exposure: 1.18, bg: [0.95, 0.94, 0.9] },
  day: { dir: [0.4, 0.95, 0.35], sun: [1.0, 0.98, 0.94], sky: [0.34, 0.37, 0.42], ground: [0.18, 0.17, 0.16], exposure: 1.1, bg: [0.93, 0.94, 0.95] },
  evening: { dir: [-0.8, 0.3, -0.35], sun: [1.1, 0.72, 0.45], sky: [0.26, 0.24, 0.28], ground: [0.14, 0.12, 0.12], exposure: 1.05, bg: [0.9, 0.84, 0.78] },
  night: { dir: [-0.2, 0.75, 0.3], sun: [0.34, 0.38, 0.5], sky: [0.12, 0.13, 0.17], ground: [0.06, 0.06, 0.08], exposure: 1.3, bg: [0.09, 0.1, 0.13] },
};

interface GpuPart { part: MeshPart; vbo: WebGLBuffer; nbo: WebGLBuffer; ibo: WebGLBuffer; count: number; pickColor: [number, number, number, number] }

export type CameraMode = 'orbit' | 'walk';
export type Projection = 'perspective' | 'ortho';
export type WallMode = 'solid' | 'transparent' | 'hidden';

export class Viewer3D {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | number> = {};
  private parts = new Map<string, GpuPart>();
  private pickIds = new Map<number, string>();
  private nextPick = 1;
  private raf = 0;
  private dirty = true;
  private keys = new Set<string>();
  private disposers: (() => void)[] = [];
  uploads = 0;

  target = [0, 1, 0];
  yaw = Math.PI / 4;
  pitch = 0.6;
  distance = 14;
  projection: Projection = 'perspective';
  mode: CameraMode = 'orbit';
  walkPos = [0, 1.6, 0];
  walkYaw = 0;
  walkPitch = 0;
  wallMode: WallMode = 'solid';
  selectedId: string | null = null;
  onPick?: (id: string | null) => void;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    if (!gl.getExtension('OES_element_index_uint')) throw new Error('WebGL extension OES_element_index_uint is required.');
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader'); return s; };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    this.prog = p;
    for (const a of ['aPos', 'aNor']) this.loc[a] = gl.getAttribLocation(p, a);
    for (const u of ['uMVP', 'uColor', 'uLight', 'uPick', 'uHi', 'uTwo', 'uSun', 'uSky', 'uGround', 'uExposure', 'uEmissive']) this.loc[u] = gl.getUniformLocation(p, u)!;
    this.attachControls();
    const loop = () => { this.raf = requestAnimationFrame(loop); this.stepWalk(); if (this.dirty) { this.dirty = false; this.draw(); } };
    this.raf = requestAnimationFrame(loop);
  }

  setParts(list: MeshPart[]) {
    const gl = this.gl;
    const seen = new Set<string>();
    for (const part of list) {
      seen.add(part.key);
      if (this.parts.has(part.key)) { this.parts.get(part.key)!.part = part; continue; }
      const mk = (data: ArrayBufferView, target: number) => { const b = gl.createBuffer()!; gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
      const id = this.nextPick++;
      this.pickIds.set(id, part.id);
      this.parts.set(part.key, {
        part, vbo: mk(new Float32Array(part.positions), gl.ARRAY_BUFFER), nbo: mk(new Float32Array(part.normals), gl.ARRAY_BUFFER),
        ibo: mk(new Uint32Array(part.indices), gl.ELEMENT_ARRAY_BUFFER), count: part.indices.length,
        pickColor: [(id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, 1],
      });
      this.uploads++;
    }
    for (const [k, g] of this.parts) if (!seen.has(k)) { gl.deleteBuffer(g.vbo); gl.deleteBuffer(g.nbo); gl.deleteBuffer(g.ibo); this.parts.delete(k); }
    this.dirty = true;
  }

  get partCount() { return this.parts.size; }

  fit() {
    const b = meshBounds([...this.parts.values()].map((g) => g.part));
    this.target = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    this.distance = Math.max(8, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 2.1);
    this.floorY = b.min[1] || 0;
    this.walkPos = [this.target[0], this.floorY + this.eyeHeight, this.target[2]];
    this.dirty = true;
  }
  preset(name: 'top' | 'iso' | 'perspective' | 'dollhouse') {
    this.mode = 'orbit';
    if (name === 'top') { this.projection = 'ortho'; this.pitch = Math.PI / 2 - 1e-4; this.yaw = 0; }
    else if (name === 'iso') { this.projection = 'ortho'; this.pitch = Math.atan(1 / Math.SQRT2); this.yaw = Math.PI / 4; }
    else if (name === 'dollhouse') { this.projection = 'perspective'; this.pitch = 0.95; this.yaw = Math.PI / 4; }
    else { this.projection = 'perspective'; this.pitch = 0.6; this.yaw = Math.PI / 4; }
    this.dirty = true;
  }
  setWalk(on: boolean) { this.mode = on ? 'walk' : 'orbit'; if (on) this.projection = 'perspective'; this.dirty = true; this.canvas.focus(); }
  /** on-screen controls (touch): hold a walk key */
  setKey(k: string, down: boolean) { if (down) this.keys.add(k); else this.keys.delete(k); this.dirty = true; }
  setWallMode(m: WallMode) { this.wallMode = m; this.dirty = true; }
  setSelected(id: string | null) { this.selectedId = id; this.dirty = true; }
  invalidate() { this.dirty = true; }

  /** daylight preset, lamp warmth (-1 cool .. 1 warm) and overall intensity */
  light: SceneLight = 'day';
  warmth = 0;
  intensity = 1;
  private superSample: number | null = null;
  /** wall segments [x0,z0,x1,z1,halfThickness] the walker cannot step through */
  private blockers: number[][] = [];
  setLight(l: SceneLight) { this.light = l; this.dirty = true; }
  setWarmth(v: number) { this.warmth = Math.max(-1, Math.min(1, v)); this.dirty = true; }
  setIntensity(v: number) { this.intensity = Math.max(0.3, Math.min(2, v)); this.dirty = true; }
  setBlockers(segs: number[][]) { this.blockers = segs; }
  setEyeHeight(h: number) { this.eyeHeight = Math.max(0.6, Math.min(2.2, h)); this.walkPos[1] = this.floorY + this.eyeHeight; this.dirty = true; }
  eyeHeight = 1.65;
  collide = true;
  private floorY = 0;

  /**
   * Render the current view at a higher pixel size and hand back a PNG/JPEG data URL. The extra
   * pixels are the quality: geometry, materials and light are exactly what the viewer shows.
   */
  capture(scale = 3, type: 'image/png' | 'image/jpeg' = 'image/png'): string {
    const before = this.superSample;
    this.superSample = Math.max(1, Math.min(4, scale));
    try {
      this.draw();
      return this.canvas.toDataURL(type, 0.95);
    } finally {
      this.superSample = before;
      this.dirty = true;
      this.draw();
    }
  }

  private camera() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1, aspect = w / h;
    let eye: number[], center: number[];
    if (this.mode === 'walk') {
      eye = this.walkPos;
      center = [eye[0] + Math.sin(this.walkYaw) * Math.cos(this.walkPitch), eye[1] + Math.sin(this.walkPitch), eye[2] - Math.cos(this.walkYaw) * Math.cos(this.walkPitch)];
    } else {
      center = this.target;
      eye = [center[0] + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw), center[1] + this.distance * Math.sin(this.pitch), center[2] + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw)];
    }
    const view = m4.lookAt(eye, center, [0, 1, 0]);
    const proj = this.projection === 'ortho' && this.mode === 'orbit'
      ? (() => { const s = this.distance / 2; return m4.ortho(-s * aspect, s * aspect, -s, s, -200, 400); })()
      : m4.perspective(this.mode === 'walk' ? 1.2 : 0.8, aspect, 0.05, 500);
    return m4.mul(proj, view);
  }

  private draw(pick = false) {
    const gl = this.gl, c = this.canvas;
    const dpr = this.superSample ?? Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(c.clientWidth * dpr)), H = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    gl.viewport(0, 0, W, H);
    const L = SCENE_LIGHTS[this.light];
    if (pick) gl.clearColor(0, 0, 0, 0); else gl.clearColor(L.bg[0], L.bg[1], L.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uMVP as WebGLUniformLocation, false, this.camera());
    gl.uniform3f(this.loc.uLight as WebGLUniformLocation, L.dir[0], L.dir[1], L.dir[2]);
    const warm = this.warmth, k = this.intensity;
    gl.uniform3f(this.loc.uSun as WebGLUniformLocation, L.sun[0] * k * (1 + 0.12 * warm), L.sun[1] * k, L.sun[2] * k * (1 - 0.12 * warm));
    gl.uniform3f(this.loc.uSky as WebGLUniformLocation, L.sky[0], L.sky[1], L.sky[2]);
    gl.uniform3f(this.loc.uGround as WebGLUniformLocation, L.ground[0], L.ground[1], L.ground[2]);
    gl.uniform1f(this.loc.uExposure as WebGLUniformLocation, L.exposure);
    gl.uniform1f(this.loc.uPick as WebGLUniformLocation, pick ? 1 : 0);
    const all = [...this.parts.values()];
    const visible = all.filter((g) => !(g.part.kind === 'wall' && this.wallMode === 'hidden') && !(g.part.kind === 'ceiling' && this.mode === 'orbit' && this.pitch > 0.2));
    const transparent = (g: GpuPart) => g.part.color[3] < 1 || (g.part.kind === 'wall' && this.wallMode === 'transparent');
    const drawOne = (g: GpuPart) => {
      const col = pick ? g.pickColor : g.part.kind === 'wall' && this.wallMode === 'transparent' ? [g.part.color[0], g.part.color[1], g.part.color[2], 0.3] : g.part.color;
      gl.uniform4fv(this.loc.uColor as WebGLUniformLocation, col as number[]);
      gl.uniform1f(this.loc.uHi as WebGLUniformLocation, !pick && this.selectedId === g.part.id ? 1 : 0);
      gl.uniform1f(this.loc.uTwo as WebGLUniformLocation, g.part.twoSided ? 1 : 0);
      gl.uniform1f(this.loc.uEmissive as WebGLUniformLocation, !pick && g.part.kind === 'light' ? (this.light === 'night' ? 1 : 0.55) : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); gl.enableVertexAttribArray(this.loc.aPos as number); gl.vertexAttribPointer(this.loc.aPos as number, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.nbo); gl.enableVertexAttribArray(this.loc.aNor as number); gl.vertexAttribPointer(this.loc.aNor as number, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibo);
      gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0);
    };
    gl.disable(gl.BLEND); gl.depthMask(true);
    for (const g of visible) if (pick || !transparent(g)) drawOne(g);
    if (!pick) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      for (const g of visible) if (transparent(g)) drawOne(g);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }

  pick(clientX: number, clientY: number): string | null {
    const r = this.canvas.getBoundingClientRect();
    this.draw(true);
    const dpr = this.canvas.width / (r.width || 1);
    const px = new Uint8Array(4);
    this.gl.readPixels(Math.round((clientX - r.left) * dpr), Math.round(this.canvas.height - (clientY - r.top) * dpr), 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, px);
    this.dirty = true;
    if (px[3] === 0) return null;
    return this.pickIds.get(px[0] + (px[1] << 8) + (px[2] << 16)) ?? null;
  }

  /** nearest distance from a point to a wall segment, in plan */
  private blocked(x: number, z: number): boolean {
    if (!this.collide) return false;
    const r = 0.26; // shoulder width
    for (const [x0, z0, x1, z1, half] of this.blockers) {
      const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
      const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)) : 0;
      const px = x0 + dx * t, pz = z0 + dz * t;
      if (Math.hypot(x - px, z - pz) < half + r) return true;
    }
    return false;
  }

  private stepWalk() {
    if (this.mode !== 'walk' || !this.keys.size) return;
    const sp = this.keys.has('shift') ? 0.12 : 0.05;
    const fx = Math.sin(this.walkYaw), fz = -Math.cos(this.walkYaw);
    let mx = 0, mz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) { mx += fx * sp; mz += fz * sp; }
    if (this.keys.has('s') || this.keys.has('arrowdown')) { mx -= fx * sp; mz -= fz * sp; }
    if (this.keys.has('a')) { mx += fz * sp; mz -= fx * sp; }
    if (this.keys.has('d')) { mx -= fz * sp; mz += fx * sp; }
    // slide along a wall instead of stopping dead against it
    if (mx || mz) {
      const x = this.walkPos[0], z = this.walkPos[2];
      if (!this.blocked(x + mx, z + mz)) { this.walkPos[0] = x + mx; this.walkPos[2] = z + mz; }
      else if (!this.blocked(x + mx, z)) this.walkPos[0] = x + mx;
      else if (!this.blocked(x, z + mz)) this.walkPos[2] = z + mz;
    }
    if (this.keys.has('arrowleft')) this.walkYaw -= 0.03;
    if (this.keys.has('arrowright')) this.walkYaw += 0.03;
    this.dirty = true;
  }

  private attachControls() {
    const c = this.canvas;
    c.tabIndex = 0;
    let drag: { x: number; y: number; button: number; moved: boolean } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    let mid0: { x: number; y: number } | null = null;
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn as EventListener, o); this.disposers.push(() => el.removeEventListener(ev, fn as EventListener));
    };
    on(c, 'contextmenu', (e) => e.preventDefault());
    on(c, 'pointerdown', (e) => {
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
      drag = { x: e.clientX, y: e.clientY, button: e.button === 2 || e.shiftKey ? 2 : 0, moved: false };
    });
    on(c, 'pointermove', (e) => {
      if (!drag) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0) { this.distance = Math.min(200, Math.max(1, this.distance * (pinch0 / d))); pinch0 = d; this.dirty = true; }
        // two-finger drag pans the orbit target
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (mid0 && this.mode === 'orbit') {
          const s = this.distance / (c.clientHeight || 1), ddx = mid.x - mid0.x, ddy = mid.y - mid0.y;
          this.target[0] -= (ddx * Math.cos(this.yaw) + ddy * Math.sin(this.yaw)) * s;
          this.target[2] -= (-ddx * Math.sin(this.yaw) + ddy * Math.cos(this.yaw)) * s;
        }
        mid0 = mid;
        if (drag) drag.moved = true;
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      drag.x = e.clientX; drag.y = e.clientY;
      if (this.mode === 'walk') { this.walkYaw += dx * 0.005; this.walkPitch = Math.max(-1.2, Math.min(1.2, this.walkPitch - dy * 0.005)); }
      else if (drag.button === 2) {
        const s = this.distance / (c.clientHeight || 1);
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        this.target[0] -= (dx * rx) * s; this.target[2] -= (dx * rz) * s;
        this.target[0] -= dy * Math.sin(this.yaw) * s; this.target[2] -= dy * Math.cos(this.yaw) * s;
      } else { this.yaw -= dx * 0.008; this.pitch = Math.max(0.02, Math.min(Math.PI / 2 - 1e-4, this.pitch + dy * 0.008)); }
      this.dirty = true;
    });
    on(c, 'pointerup', (e) => {
      pointers.delete(e.pointerId); if (pointers.size < 2) { pinch0 = 0; mid0 = null; }
      if (drag && !drag.moved && this.onPick) { const id = this.pick(e.clientX, e.clientY); this.selectedId = id; this.onPick(id); }
      drag = null;
    });
    on(c, 'wheel', (e) => { e.preventDefault(); this.distance = Math.min(200, Math.max(1, this.distance * Math.exp(e.deltaY * 0.001))); this.dirty = true; }, { passive: false });
    on(c, 'keydown', (e) => { this.keys.add(e.key.toLowerCase()); if (e.shiftKey) this.keys.add('shift'); });
    on(c, 'keyup', (e) => { this.keys.delete(e.key.toLowerCase()); if (!e.shiftKey) this.keys.delete('shift'); });
    on(c, 'blur', () => this.keys.clear());
    const ro = new ResizeObserver(() => { this.dirty = true; });
    ro.observe(c); this.disposers.push(() => ro.disconnect());
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
    const gl = this.gl;
    for (const g of this.parts.values()) { gl.deleteBuffer(g.vbo); gl.deleteBuffer(g.nbo); gl.deleteBuffer(g.ibo); }
    this.parts.clear();
  }
}
