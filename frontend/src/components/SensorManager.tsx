import { useEffect, useRef, useState } from 'react';
import { useDeviceMotion } from '../hooks/useDeviceMotion';
import { Wifi, WifiOff, Play, Square, AlertTriangle, RefreshCw } from 'lucide-react';

interface SensorManagerProps {
  onUpdateSessionData: (data: any) => void;
  isSessionActive: boolean;
  setIsSessionActive: (active: boolean) => void;
  onSessionReset: () => void;
}

export function SensorManager({
  onUpdateSessionData,
  isSessionActive,
  setIsSessionActive,
  onSessionReset
}: SensorManagerProps) {
  const {
    permission,
    requestPermission,
    samplingRate,
    isThrottled,
    isListening,
    startListening,
    stopListening,
    flushBuffers
  } = useDeviceMotion();

  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const sendIntervalRef = useRef<number | null>(null);

  // Initialize/terminate session
  const toggleSession = async () => {
    if (isSessionActive) {
      // Stop session
      handleStopSession();
    } else {
      // Start session
      handleStartSession();
    }
  };

  const handleStartSession = async () => {
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
    
    // Resolve websocket URL: use current page host but port 8000 for backend
    // Falls back to localhost if hostname is invalid.
    const hostname = window.location.hostname || 'localhost';
    const wsUrl = `ws://${hostname}:8000/ws/session`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        setIsSessionActive(true);
        // Send initial start signal
        ws.send(JSON.stringify({ event: 'start' }));
        // Start capturing device motion
        startListening();
      };

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          if (response.status === 'processing' || response.status === 'session_stopped') {
            onUpdateSessionData(response.data);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Workout Tracker</h2>
          <p className="text-xs text-slate-400 font-medium">Capture movement data</p>
        </div>

        <button
          onClick={toggleSession}
          disabled={wsStatus === 'connecting'}
          className={`flex items-center space-x-2 px-5 py-3 rounded-2xl font-semibold text-sm shadow-md transition-all duration-200 ${
            isSessionActive
              ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 shadow-rose-100'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'
          }`}
        >
          {wsStatus === 'connecting' ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : isSessionActive ? (
            <>
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Tracking</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Start Tracking</span>
            </>
          )}
        </button>
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

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-2xl text-xs font-medium">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
export default SensorManager;
