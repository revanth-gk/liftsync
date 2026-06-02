import { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { SensorManager } from './components/SensorManager';
import { Dashboard } from './components/Dashboard';
import { WorkoutReport } from './components/WorkoutReport';
import { registerPWA } from './registerServiceWorker';
import { Compass, Info, Dumbbell, Flame, Activity, Smartphone, ArrowRight } from 'lucide-react';

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
  const [selectedExercise, setSelectedExercise] = useState<string>('bicep_curl');
  const [showReport, setShowReport] = useState<boolean>(false);
  const [baselines, setBaselines] = useState<Record<string, any>>({});
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationRepCount, setCalibrationRepCount] = useState<number>(0);

  // Register PWA service worker on launch
  useEffect(() => {
    registerPWA();
  }, []);

  // Track session activity transition to show report on finish
  const prevSessionActive = useRef(isSessionActive);
  useEffect(() => {
    if (prevSessionActive.current && !isSessionActive && sessionData && sessionData.rep_count > 0) {
      setShowReport(true);
    }
    prevSessionActive.current = isSessionActive;
  }, [isSessionActive, sessionData]);

  const handleUpdateSessionData = (data: SessionData) => {
    setSessionData(data);
    if (isCalibrating) {
      setCalibrationRepCount(data.rep_count);
    }
  };

  const handleSessionReset = () => {
    setSessionData(null);
  };

  // Define exercise config details
  const exercises = [
    {
      id: 'bicep_curl',
      name: 'Bicep Curls',
      icon: <Dumbbell className="w-5 h-5" />,
      target: 'Biceps & Forearms',
      color: 'blue',
      guide: {
        placement: 'Forearm (armband or hand)',
        steps: [
          'Strap the phone to your active forearm using an armband, screen facing outwards.',
          'If no armband is available, hold the phone firmly in your hand with the screen facing you.',
          'Start tracking, stand still for 1 second to calibrate, and keep your elbows tucked at your sides.'
        ]
      }
    },
    {
      id: 'squat',
      name: 'Squats',
      icon: <Flame className="w-5 h-5" />,
      target: 'Quads & Glutes',
      color: 'amber',
      guide: {
        placement: 'Front trouser pocket or thigh',
        steps: [
          'Place the phone in your front trouser pocket (tight pockets work best to minimize sway).',
          'Alternatively, strap the phone to your upper thigh with the screen facing outwards.',
          'Stand completely upright, start tracking, calibrate for 1 second, and squat to parallel.'
        ]
      }
    },
    {
      id: 'overhead_press',
      name: 'Overhead Press',
      icon: <Activity className="w-5 h-5" />,
      target: 'Shoulders & Core',
      color: 'purple',
      guide: {
        placement: 'Upper arm or hand',
        steps: [
          'Strap the phone to your upper arm (triceps/biceps area) using an armband.',
          'Alternatively, hold the phone firmly in your hand, screen facing forward.',
          'Stand tall, start tracking, calibrate, and press vertically overhead in a straight line.'
        ]
      }
    }
  ];

  const activeExerciseObj = exercises.find(e => e.id === selectedExercise) || exercises[0];

  const handleUpdateCalibrationBaseline = (baseline: any) => {
    setBaselines(prev => ({ ...prev, [selectedExercise]: baseline }));
    setIsCalibrating(false);
    alert(`Calibration completed for ${activeExerciseObj.name}! Custom baseline saved.`);
  };

  const handleSetIsCalibrating = (val: boolean) => {
    setIsCalibrating(val);
    if (val) {
      setCalibrationRepCount(0);
    }
  };

  return (
    <Layout>
      {/* Exercise Selector Grid */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900 text-sm">Select Exercise</h2>
          <p className="text-[10px] text-slate-400 font-medium">Choose target biomechanical profile</p>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {exercises.map((ex) => {
            const isSelected = selectedExercise === ex.id;
            return (
              <button
                key={ex.id}
                disabled={isSessionActive}
                onClick={() => setSelectedExercise(ex.id)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all duration-200 ${
                  isSessionActive ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  isSelected
                    ? ex.color === 'blue'
                      ? 'border-blue-500 bg-blue-50/50 text-blue-600 shadow-sm'
                      : ex.color === 'amber'
                      ? 'border-amber-500 bg-amber-50/50 text-amber-600 shadow-sm'
                      : 'border-purple-500 bg-purple-50/50 text-purple-600 shadow-sm'
                    : 'border-slate-100 hover:border-slate-200 text-slate-500 hover:bg-slate-50/30'
                }`}
              >
                <div className={`p-2 rounded-xl mb-1.5 ${
                  isSelected
                    ? ex.color === 'blue'
                      ? 'bg-blue-100/60'
                      : ex.color === 'amber'
                      ? 'bg-amber-100/60'
                      : 'bg-purple-100/60'
                    : 'bg-slate-100'
                }`}>
                  {ex.icon}
                </div>
                <span className="font-bold text-[10px] whitespace-nowrap leading-none mb-1">{ex.name}</span>
                <span className="text-[8px] text-slate-400 font-medium leading-none block">{ex.target}</span>
                {baselines[ex.id] && (
                  <span className="mt-1.5 text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                    ✓ Calibrated
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sensor stream controller and permissions */}
      <SensorManager 
        onUpdateSessionData={handleUpdateSessionData}
        isSessionActive={isSessionActive}
        setIsSessionActive={setIsSessionActive}
        onSessionReset={handleSessionReset}
        selectedExercise={selectedExercise}
        onUpdateCalibrationBaseline={handleUpdateCalibrationBaseline}
        savedBaseline={baselines[selectedExercise] || null}
        isCalibrating={isCalibrating}
        setIsCalibrating={handleSetIsCalibrating}
        calibrationRepCount={calibrationRepCount}
      />

      {/* Dynamic Strapping Guide Card */}
      {(!sessionData || sessionData.rep_count === 0) && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Compass className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-sm">Mounting & Strapping Guide</h3>
            </div>
            <span className="bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded-full">
              {activeExerciseObj.name}
            </span>
          </div>
          
          {/* Strapping Instruction Diagram Placeholder */}
          <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">Required Placement</span>
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-500" /> {activeExerciseObj.guide.placement}
              </span>
            </div>
            <div className="w-14 h-14 bg-white border border-slate-100 rounded-xl shadow-sm flex items-center justify-center shrink-0">
              <div className="relative">
                <Smartphone className="w-7 h-7 text-slate-400 animate-pulse" />
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white" />
              </div>
            </div>
          </div>

          {/* Step-by-Step Instructions */}
          <div className="space-y-3 text-xs leading-relaxed text-slate-500">
            {activeExerciseObj.guide.steps.map((step, idx) => (
              <div key={idx} className="flex items-start space-x-2.5">
                <span className="bg-slate-100 text-slate-700 font-extrabold w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px]">
                  {idx + 1}
                </span>
                <p className="text-slate-500 text-[11px] leading-normal">{step}</p>
              </div>
            ))}
          </div>

          <div className="bg-blue-50/50 border border-blue-100 text-blue-800 p-3.5 rounded-2xl flex items-start space-x-2.5 text-xs">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              Secure the phone tightly. Loose mounting causes sensor vibrations, which the ML engine might classify as structural form degradation.
            </p>
          </div>
        </div>
      )}

      {/* Analytics Dashboard */}
      <Dashboard 
        sessionData={sessionData}
        isSessionActive={isSessionActive}
        exercise={selectedExercise}
      />

      {/* Post-Workout Report Modal */}
      {showReport && (
        <WorkoutReport 
          exercise={selectedExercise}
          sessionData={sessionData}
          onClose={() => {
            setShowReport(false);
            handleSessionReset();
          }}
        />
      )}
    </Layout>
  );
}
export default App;
