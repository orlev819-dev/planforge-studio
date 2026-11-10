/**
 * Device capture interfaces (scanning + Bluetooth lasers).
 * STATUS: scanning = interfaces + capability detection only (no native module). Lasers: Bosch GLM-C via Web Bluetooth.
 * Nothing here fabricates sensor or laser measurements; simulated packets exist only in tests.
 */
import type { Vec2 } from '../../shared-types/src/index';

export type CaptureBackend = 'roomplan-ios' | 'arkit-ios' | 'arcore-android' | 'webxr' | 'manual';

export interface Capability { backend: CaptureBackend; available: boolean; reason: string }

/** Output every scanning backend must produce; converted into the common model with addRoom/addOpening. */
export interface ScannedRoom {
  name?: string;
  /** closed outline on the floor plane, meters, plan coordinates */
  outline: Vec2[];
  height: number;
  openings: { kind: 'door' | 'window' | 'opening'; edgeIndex: number; t: number; width: number; height: number; sill: number; confidence: number }[];
  /** 0..1 per wall edge, as reported by the native API */
  confidence: number[];
  source: CaptureBackend;
}

export interface ScanSession {
  readonly backend: CaptureBackend;
  start(): Promise<void>;
  onTrackingState(cb: (s: 'notAvailable' | 'limited' | 'normal') => void): void;
  onProgress(cb: (p: { detectedWalls: number; coverage: number }) => void): void;
  finish(): Promise<ScannedRoom[]>;
  cancel(): void;
}

/** Native bridge contract (implemented by apps/mobile in Swift / Kotlin; not present in this build). */
export interface NativeScanBridge { capabilities(): Promise<Capability[]>; createSession(b: CaptureBackend): Promise<ScanSession> }

export async function detectCapabilities(): Promise<Capability[]> {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }) : null;
  let webxr = false;
  try { webxr = !!(nav?.xr && (await nav.xr.isSessionSupported('immersive-ar'))); } catch { webxr = false; }
  return [
    { backend: 'roomplan-ios', available: false, reason: 'Requires the native iOS app (RoomPlan, LiDAR devices). Not part of this build.' },
    { backend: 'arkit-ios', available: false, reason: 'Requires the native iOS app. Not part of this build.' },
    { backend: 'arcore-android', available: false, reason: 'Requires the native Android app. Not part of this build.' },
    { backend: 'webxr', available: false, reason: webxr ? 'WebXR AR is supported by this browser, but measured capture is not implemented yet.' : 'WebXR immersive-ar not supported by this browser.' },
    { backend: 'manual', available: true, reason: 'Manual drawing / tracing with typed measurements.' },
  ];
}

// ------------------------------------------------------------------ Bluetooth laser measures
export interface LaserReading { meters: number; device: string; at: number }
export interface LaserDriver {
  /** vendor/model this driver implements against a documented protocol */
  readonly id: string;
  readonly serviceUuids: string[];
  connect(device: unknown): Promise<void>;
  onReading(cb: (r: LaserReading) => void): void;
  onDisconnect(cb: () => void): void;
  disconnect(): Promise<void>;
}
/**
 * Supported laser measures. Bosch GLM 50-27 C/CG is implemented in ./bosch-glm.ts against a community-documented
 * (not official) protocol; it has unit tests with synthetic packets but has not been verified on hardware by us.
 */
export const SUPPORTED_LASERS = [{ id: 'bosch-glm-c', models: ['Bosch GLM 50-27 C', 'Bosch GLM 50-27 CG'], protocol: 'community reverse-engineered', hardwareVerified: false }];
export * from './bosch-glm';
export const webBluetoothAvailable = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;
