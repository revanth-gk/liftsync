import { useEffect, useRef, useState } from 'react';
import { useDeviceMotion } from '../hooks/useDeviceMotion';
import { Wifi, WifiOff, Play, Square, AlertTriangle, RefreshCw } from 'lucide-react';

interface SensorManagerProps {
  onUpdateSessionData: (data: any) => void;
  isSessionActive: boolean;
  setIsSessionActive: (active: boolean) => void;
  onSessionReset: () => void;
  selectedExercise: string;
  onUpdateCalibrationBaseline: (baseline: any) => void;
  savedBaseline: any;
  isCalibrating: boolean;
  setIsCalibrating: (val: boolean) => void;
  calibrationRepCount: number;
}

export function SensorManager({
  onUpdateSessionData,
  isSessionActive,
  setIsSessionActive,
  onSessionReset,
  selectedExercise,
  onUpdateCalibrationBaseline,
  savedBaseline,
  isCalibrating,
  setIsCalibrating,
  calibrationRepCount
}: SensorManagerProps) {
  const {
    permission,
    requestPermission,
    samplingRate,
    isThrottled,
    isListening,
    latestSample,
    startListening,
    stopListening,
    flushBuffers
  } = useDeviceMotion();

  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const sendIntervalRef = useRef<number | null>(null);

  // Initialize/terminate session
  const startSession = async (calibrateMode: boolean) => {
    setIsCalibrating(calibrateMode);
    handleStartSession(calibrateMode);
  };

  const handleStartSession = async (calibrateMode: boolean) => {
    setErrorMessage(null);
    onSessionReset();

    // 1. Negotiate sensor permissions
    const permitted = await requestPermission();
    if (!permitted) {
      setErrorMessage('Camera/Sensor permissions are required to sample IMU data.');
      return;
    }

    // 2. Establish WebSocket connection
    setWsStatus('connecting');
    
    // Resolve websocket URL dynamically
    let wsUrl = (import.meta as any).env?.VITE_WS_URL;
    if (!wsUrl) {
      const hostname = window.location.hostname || 'localhost';
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        wsUrl = `ws://${hostname}:8000/ws/session`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrl = `${protocol}://${hostname}/ws/session`;
      }
    }
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        setIsSessionActive(true);
        // Send initial start signal with selected exercise, mode, and baseline
        ws.send(
          JSON.stringify({
            event: 'start',
            exercise: selectedExercise,
            mode: calibrateMode ? 'calibrate' : 'workout',
            baseline: savedBaseline
          })
        );
        // Start capturing device motion
        startListening();
      };

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          if (response.status === 'processing' || response.status === 'session_stopped') {
            onUpdateSessionData(response.data);
          } else if (response.status === 'calibration_completed') {
            onUpdateCalibrationBaseline(response.baseline);
            if (response.data) {
              onUpdateSessionData(response.data);
            }
            handleStopSession();
          } else if (response.status === 'error') {
            setErrorMessage(response.message);
          }
        } catch (err) {
          console.error('Error parsing backend ws frame:', err);
        }
      };

      ws.onerror = () => {
        setErrorMessage('WebSocket connection error. Make sure the Python backend is running.');
        handleStopSession();
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        handleStopSession();
      };

    } catch (err: any) {
      setWsStatus('disconnected');
      setErrorMessage(`Failed to connect to backend: ${err.message}`);
    }
  };

  const handleStopSession = () => {
    setIsSessionActive(false);
    stopListening();

    // Clear batch sending interval
    if (sendIntervalRef.current) {
      window.clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }

    // Inform backend and close socket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ event: 'stop' }));
      } catch (err) {
        console.error('Error sending stop event:', err);
      }
      wsRef.current.close();
    }
    wsRef.current = null;
  };

  // Buffer batch sender loop
  // Batches raw signals and flushes every 150ms (~15 frames at 100 Hz)
  useEffect(() => {
    if (isListening && wsStatus === 'connected' && wsRef.current) {
      sendIntervalRef.current = window.setInterval(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const { accel, gyro } = flushBuffers();
        if (accel.length > 0 && gyro.length > 0) {
          wsRef.current.send(
            JSON.stringify({
              event: 'data',
              accel,
              gyro
            })
          );
        }
      }, 150); // 150ms interval ~ 15 samples at 100 Hz
    }

    return () => {
      if (sendIntervalRef.current) {
        window.clearInterval(sendIntervalRef.current);
        sendIntervalRef.current = null;
      }
    };
  }, [isListening, wsStatus, flushBuffers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sendIntervalRef.current) window.clearInterval(sendIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
      {/* Session Controls */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Workout Tracker</h2>
          <p className="text-xs text-slate-400 font-medium">Capture movement data</p>
        </div>

        {isSessionActive ? (
          <button
            onClick={handleStopSession}
            className="flex items-center space-x-2 px-5 py-3 rounded-2xl font-semibold text-sm shadow-md transition-all duration-200 bg-rose-50 text-rose-600 hover:bg-rose-100 shadow-rose-100"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>{isCalibrating ? 'Stop Calibration' : 'Stop Tracking'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => startSession(true)}
              disabled={wsStatus === 'connecting'}
              className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl font-semibold text-xs border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all duration-200"
            >
              <span>Calibrate (5 reps)</span>
            </button>
            <button
              onClick={() => startSession(false)}
              disabled={wsStatus === 'connecting'}
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-100 transition-all duration-200"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Workout</span>
            </button>
          </div>
        )}
      </div>

      {/* Network and Perm Status Badge */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-2xl text-xs font-semibold">
          {wsStatus === 'connected' ? (
            <>
              <Wifi className="w-4 h-4 text-emerald-500" />
              <span className="text-slate-600">Engine Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">Engine Offline</span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-2xl text-xs font-semibold">
          <div className="flex flex-col">
            <span className="text-slate-400 font-medium leading-none">Sampling Rate</span>
            <span className={`text-[11px] font-bold mt-1 ${isThrottled ? 'text-amber-600' : 'text-slate-600'}`}>
              {samplingRate > 0 ? `${samplingRate} Hz` : '0 Hz'}
            </span>
          </div>
        </div>
      </div>

      {/* Throttle Warning */}
      {isThrottled && (
        <div className="flex items-start space-x-2.5 bg-amber-50/70 border border-amber-100 text-amber-800 p-3 rounded-2xl text-xs leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Sampling Throttled!</span> Keep the web page active and avoid locking the screen to sustain optimal signal processing resolution (100 Hz).
          </div>
        </div>
      )}

      {/* Sensor Permission Error Messages */}
      {permission === 'unsupported' && (
        <div className="flex items-start space-x-2.5 bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-2xl text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Incompatible Device!</span> This browser does not support physical accelerometer / gyroscope motion event endpoints. Run the app on a mobile device.
          </div>
        </div>
      )}

      {/* Live Telemetry Panel (Only visible when active) */}
      {isListening && latestSample && (
        <div className="bg-slate-900 text-slate-100 rounded-2xl p-4.5 space-y-3 shadow-inner border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Live IMU Telemetry</span>
            <div className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              <span className="text-[9px] text-slate-400 font-bold uppercase">Streaming</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5 text-[11px]">
            {/* Linear Acceleration Magnitude Meter */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-mono text-[9.5px]">
                <span className="text-slate-400 font-semibold">Motion Force</span>
                <span className="text-slate-200 font-bold">
                  {Math.sqrt(
                    latestSample.linearAccel[0] ** 2 +
                    latestSample.linearAccel[1] ** 2 +
                    latestSample.linearAccel[2] ** 2
                  ).toFixed(2)} m/s²
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-100"
                  style={{ 
                    width: `${Math.min(100, Math.sqrt(
                      latestSample.linearAccel[0] ** 2 +
                      latestSample.linearAccel[1] ** 2 +
                      latestSample.linearAccel[2] ** 2
                    ) * 10)}%` 
                  }}
                />
              </div>
            </div>

            {/* Tilt Angle (Pitch / Beta angle) */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-mono text-[9.5px]">
                <span className="text-slate-400 font-semibold">Device Tilt</span>
                <span className="text-slate-200 font-bold">
                  {Math.round(latestSample.orientation.beta)}°
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-100"
                  style={{ 
                    width: `${Math.min(100, Math.abs(latestSample.orientation.beta) / 1.8)}%` 
                  }}
                />
              </div>
            </div>
          </div>

          {/* Calibrating Progress Count Indicator */}
          {isCalibrating && (
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-semibold">Calibration Progress:</span>
              <span className="text-amber-400 font-extrabold font-mono">{calibrationRepCount} / 5 reps</span>
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-2xl text-xs font-medium">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
export default SensorManager;
