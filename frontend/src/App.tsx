import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { SensorManager } from './components/SensorManager';
import { Dashboard } from './components/Dashboard';
import { registerPWA } from './registerServiceWorker';
import { Compass, Info, ShieldAlert } from 'lucide-react';

interface RepFeature {
  duration: number;
  rms_accel_mag: number;
  rms_gyro_mag: number;
  rms_accel_x: number;
  rms_accel_y: number;
  rms_accel_z: number;
  rms_gyro_x: number;
  rms_gyro_y: number;
  rms_gyro_z: number;
  jerk: number;
  displacement_p2p: number;
  fft_accel_mag: number;
  fft_gyro_mag: number;
  dominant_plane: string;
  degrading_plane: string;
  instability_ratio: number;
}

interface RepetitionData {
  rep_index: number;
  start_idx: number;
  end_idx: number;
  features: RepFeature;
  classification: 'Fresh' | 'Fatigued';
  composite_score: number;
  cusum_value: number;
}

interface SessionData {
  rep_count: number;
  reps: RepetitionData[];
  form_break_idx: number;
  recommended_ceiling: number | null;
  dominant_axis: string;
}

export function App() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);

  // Register PWA service worker on launch
  useEffect(() => {
    registerPWA();
  }, []);

  const handleUpdateSessionData = (data: SessionData) => {
    setSessionData(data);
  };

  const handleSessionReset = () => {
    setSessionData(null);
  };

  return (
    <Layout>
      {/* Sensor stream controller and permissions */}
      <SensorManager 
        onUpdateSessionData={handleUpdateSessionData}
        isSessionActive={isSessionActive}
        setIsSessionActive={setIsSessionActive}
        onSessionReset={handleSessionReset}
      />

      {/* Guide Card (Only visible when session is not running or no reps have been recorded yet) */}
      {(!sessionData || sessionData.rep_count === 0) && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2.5">
            <Compass className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm">Mounting & Usage Guide</h3>
          </div>
          
          <div className="space-y-3 text-xs leading-relaxed text-slate-500">
            <div className="flex items-start space-x-2">
              <span className="bg-slate-100 text-slate-700 font-extrabold w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                1
              </span>
              <p>
                Secure your mobile device to your forearm (using an armband) or place it in your pocket. Keep screen orientation locked to portrait.
              </p>
            </div>
            <div className="flex items-start space-x-2">
              <span className="bg-slate-100 text-slate-700 font-extrabold w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                2
              </span>
              <p>
                Click <span className="font-semibold text-slate-700">Start Tracking</span> and grant permission to motion sensors. Stand completely still for 1 second.
              </p>
            </div>
            <div className="flex items-start space-x-2">
              <span className="bg-slate-100 text-slate-700 font-extrabold w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                3
              </span>
              <p>
                Perform your repetitions. The first 3 repetitions are used as baseline calibrators to calculate form shift thresholds.
              </p>
            </div>
          </div>

          <div className="bg-blue-50/50 border border-blue-100 text-blue-800 p-3.5 rounded-2xl flex items-start space-x-2.5 text-xs">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              If running on Chrome / Safari mobile, make sure the page is viewed via secure <span className="font-semibold">HTTPS</span>, otherwise browser security will block motion sensors.
            </p>
          </div>
        </div>
      )}

      {/* Analytics Dashboard */}
      <Dashboard 
        sessionData={sessionData}
        isSessionActive={isSessionActive}
      />
    </Layout>
  );
}
export default App;
