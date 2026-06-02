import { useState, useEffect, useRef, useCallback } from 'react';

export interface IMUSample {
  accel: [number, number, number]; // [x, y, z] in m/s^2 (including gravity)
  linearAccel: [number, number, number]; // [x, y, z] in m/s^2 (excluding gravity)
  gyro: [number, number, number];  // [x, y, z] in rad/s
  orientation: { alpha: number; beta: number; gamma: number }; // yaw, pitch, roll in degrees
  timestamp: number;
}

export type PermissionState = 'unasked' | 'requesting' | 'granted' | 'denied' | 'unsupported';

export function useDeviceMotion() {
  const [permission, setPermission] = useState<PermissionState>('unasked');
  const [samplingRate, setSamplingRate] = useState<number>(0);
  const [isThrottled, setIsThrottled] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  
  // Latest sample state (throttled updates to prevent React thread lockup)
  const [latestSample, setLatestSample] = useState<IMUSample | null>(null);

  // Buffer references for performance (preventing excessive re-renders)
  const accelBufferRef = useRef<number[][]>([]);
  const gyroBufferRef = useRef<number[][]>([]);
  
  // Timing references for sample rate calculation
  const lastEventTimeRef = useRef<number>(0);
  const eventTimestampsRef = useRef<number[]>([]);
  const sampleCountRef = useRef<number>(0);

  // Orientation reference (yaw, pitch, roll)
  const orientationRef = useRef<{ alpha: number; beta: number; gamma: number }>({ alpha: 0, beta: 0, gamma: 0 });

  const handleDeviceOrientation = useCallback((event: DeviceOrientationEvent) => {
    orientationRef.current = {
      alpha: event.alpha ?? 0,
      beta: event.beta ?? 0,
      gamma: event.gamma ?? 0
    };
  }, []);

  // Check if DeviceMotionEvent is supported on the browser
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check if permission requests are needed (iOS 13+)
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (DeviceMotionEvent as any).requestPermission === 'function'
    ) {
      setPermission('unasked');
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      // Android / Older browsers: permission is granted implicitly if supported
      setPermission('granted');
    } else {
      setPermission('unsupported');
    }
  }, []);

  // Request permissions explicitly (essential for iOS)
  const requestPermission = async (): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dm = DeviceMotionEvent as any;
    
    if (dm && typeof dm.requestPermission === 'function') {
      setPermission('requesting');
      try {
        const response = await dm.requestPermission();
        if (response === 'granted') {
          setPermission('granted');
          return true;
        } else {
          setPermission('denied');
          return false;
        }
      } catch (err) {
        console.error('Error requesting device motion permission:', err);
        setPermission('denied');
        return false;
      }
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      setPermission('granted');
      return true;
    } else {
      setPermission('unsupported');
      return false;
    }
  };

  // Device Motion handler
  const handleDeviceMotion = useCallback((event: DeviceMotionEvent) => {
    const now = performance.now();
    const accel = event.accelerationIncludingGravity;
    const accelNoGrav = event.acceleration;
    const gyro = event.rotationRate;
    
    if (!accel) return;

    // 1. Parse accelerometer data (fallback to 0)
    const ax = accel.x ?? 0.0;
    const ay = accel.y ?? 0.0;
    const az = accel.z ?? 0.0;

    // Parse linear acceleration (excluding gravity)
    const lax = accelNoGrav?.x ?? 0.0;
    const lay = accelNoGrav?.y ?? 0.0;
    const laz = accelNoGrav?.z ?? 0.0;

    // 2. Parse and convert gyroscope data from degrees/sec to radians/sec
    // beta, gamma, alpha are degrees per second
    const degToRad = Math.PI / 180.0;
    const gx = (gyro?.beta ?? 0.0) * degToRad;
    const gy = (gyro?.gamma ?? 0.0) * degToRad;
    const gz = (gyro?.alpha ?? 0.0) * degToRad;

    // 3. Append to performance buffers (we send accelerationIncludingGravity to maintain backend feature calculation consistency)
    accelBufferRef.current.push([ax, ay, az]);
    gyroBufferRef.current.push([gx, gy, gz]);

    // 4. Calculate sampling rate dynamically based on sliding timestamps window (last 50 samples)
    if (lastEventTimeRef.current > 0) {
      const timestamps = eventTimestampsRef.current;
      timestamps.push(now);
      if (timestamps.length > 50) {
        timestamps.shift();
      }
      
      if (timestamps.length > 1) {
        const totalDurationMs = timestamps[timestamps.length - 1] - timestamps[0];
        const rate = (timestamps.length - 1) / (totalDurationMs / 1000.0);
        setSamplingRate(Math.round(rate));
        
        // Throttling warning: check if rate drops below 50 Hz
        setIsThrottled(rate < 50.0);
      }
    }
    lastEventTimeRef.current = now;
    sampleCountRef.current++;

    // 5. Throttled UI state updates (update state at 10 Hz to keep rendering light)
    if (sampleCountRef.current % 10 === 0) {
      setLatestSample({
        accel: [ax, ay, az],
        linearAccel: [lax, lay, laz],
        gyro: [gx, gy, gz],
        orientation: { ...orientationRef.current },
        timestamp: Date.now()
      });
    }
  }, []);

  // Listeners controller
  const startListening = useCallback(() => {
    if (permission !== 'granted') return;
    
    // Clear buffer refs first
    accelBufferRef.current = [];
    gyroBufferRef.current = [];
    eventTimestampsRef.current = [];
    lastEventTimeRef.current = 0;
    sampleCountRef.current = 0;
    
    window.addEventListener('devicemotion', handleDeviceMotion);
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    setIsListening(true);
  }, [permission, handleDeviceMotion, handleDeviceOrientation]);

  const stopListening = useCallback(() => {
    window.removeEventListener('devicemotion', handleDeviceMotion);
    window.removeEventListener('deviceorientation', handleDeviceOrientation);
    setIsListening(false);
    setSamplingRate(0);
    setIsThrottled(false);
  }, [handleDeviceMotion, handleDeviceOrientation]);

  // Flush buffer function for WebSocket batches
  const flushBuffers = useCallback((): { accel: number[][]; gyro: number[][] } => {
    const accel = [...accelBufferRef.current];
    const gyro = [...gyroBufferRef.current];
    
    accelBufferRef.current = [];
    gyroBufferRef.current = [];
    
    return { accel, gyro };
  }, []);

  // Clean listeners on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, [handleDeviceMotion, handleDeviceOrientation]);

  return {
    permission,
    requestPermission,
    samplingRate,
    isThrottled,
    isListening,
    latestSample,
    startListening,
    stopListening,
    flushBuffers
  };
}
