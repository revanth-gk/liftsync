import { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { SensorManager } from './components/SensorManager';
import { WorkoutReport } from './components/WorkoutReport';
import { registerPWA } from './registerServiceWorker';
import { Compass, Info, Dumbbell, Flame, Activity, Smartphone, ArrowRight, CheckCircle, Play, Timer, Sparkles } from 'lucide-react';

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

type WorkoutStep = 'select_exercise' | 'calibrate' | 'workout_setup' | 'active_workout' | 'report';

export function App() {
  const [currentStep, setCurrentStep] = useState<WorkoutStep>('select_exercise');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [selectedExercise, setSelectedExercise] = useState<string>('bicep_curl');
  
  // Custom calibration & baseline states
  const [baselines, setBaselines] = useState<Record<string, any>>({});
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationRepCount, setCalibrationRepCount] = useState<number>(0);
  
  // Timer states
  const [workoutDuration, setWorkoutDuration] = useState<number>(60); // in seconds
  const [timerSeconds, setTimerSeconds] = useState<number>(60);

  // Register PWA service worker on launch
  useEffect(() => {
    registerPWA();
  }, []);

  // Set up active workout countdown timer
  useEffect(() => {
    let interval: number | null = null;
    if (currentStep === 'active_workout' && isSessionActive && timerSeconds > 0) {
      interval = window.setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            // Timer expired! Stop the session which will prompt report transition
            setIsSessionActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [currentStep, isSessionActive, timerSeconds]);

  // Transition from active workout to report when session becomes inactive
  const prevSessionActive = useRef(isSessionActive);
  useEffect(() => {
    if (currentStep === 'active_workout' && prevSessionActive.current && !isSessionActive) {
      setCurrentStep('report');
    }
    prevSessionActive.current = isSessionActive;
  }, [isSessionActive, currentStep]);

  const handleUpdateSessionData = (data: SessionData) => {
    setSessionData(data);
    if (isCalibrating) {
      setCalibrationRepCount(data.rep_count);
    }
  };

  const handleSessionReset = () => {
    setSessionData(null);
  };

  const handleUpdateCalibrationBaseline = (baseline: any) => {
    setBaselines(prev => ({ ...prev, [selectedExercise]: baseline }));
    setIsCalibrating(false);
    alert(`Calibration completed for ${activeExerciseObj.name}! Personalized baseline saved.`);
    setCurrentStep('workout_setup');
  };

  const handleSetIsCalibrating = (val: boolean) => {
    setIsCalibrating(val);
    if (val) {
      setCalibrationRepCount(0);
    }
  };

  // Define exercise configurations
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Layout>
      {/* STEP 1: SELECT EXERCISE */}
      {currentStep === 'select_exercise' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-3">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Select Exercise</h2>
              <p className="text-[10px] text-slate-400 font-medium">Choose target biomechanical profile</p>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {exercises.map((ex) => {
                const isSelected = selectedExercise === ex.id;
                const isCalibrated = !!baselines[ex.id];
                return (
                  <button
                    key={ex.id}
                    onClick={() => setSelectedExercise(ex.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all duration-200 ${
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
                    {isCalibrated && (
                      <span className="mt-2 text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <CheckCircle className="w-2 h-2" /> Calibrated
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Mounting Guide */}
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
          </div>

          {/* Action buttons to trigger next step */}
          <div className="flex gap-3">
            <button
              onClick={() => setCurrentStep('calibrate')}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 px-6 rounded-2xl shadow-md transition-all text-xs flex items-center justify-center gap-2"
            >
              <span>Proceed to Calibration</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            {baselines[selectedExercise] && (
              <button
                onClick={() => setCurrentStep('workout_setup')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-2xl shadow-md transition-all text-xs flex items-center justify-center gap-2"
              >
                <span>Skip to Workout</span>
                <Play className="w-4 h-4 fill-current" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: CALIBRATE PER REP */}
      {currentStep === 'calibrate' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-3">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Personalized Calibration</span>
            </h2>
            <p className="text-xs text-slate-400">
              Perform 5 clean, controlled repetitions of <strong>{activeExerciseObj.name}</strong> to calibrate baseline dynamics.
            </p>
          </div>

          {/* Large Calibration Progress Indicator */}
          {isSessionActive && isCalibrating && (
            <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-amber-100 animate-ping" />
                <div className="absolute inset-0 rounded-full border-4 border-amber-500 flex flex-col items-center justify-center bg-amber-50/50">
                  <span className="text-4xl font-black text-amber-600">{calibrationRepCount}</span>
                  <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider mt-1">/ 5 Reps</span>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Calibration Set Active</h3>
                <p className="text-[11px] text-slate-400 mt-1">Rep segmentations will count up automatically.</p>
              </div>
            </div>
          )}

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
            modeFilter="calibrate"
          />

          {!isSessionActive && (
            <button
              onClick={() => setCurrentStep('select_exercise')}
              className="w-full bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold py-3 px-6 rounded-2xl transition-all text-xs text-center border border-slate-100"
            >
              Back to Selector
            </button>
          )}
        </div>
      )}

      {/* STEP 3: WORKOUT SETUP (TIMER CHOICE) */}
      {currentStep === 'workout_setup' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-900 text-base">Calibration baseline saved!</h2>
              <p className="text-xs text-slate-400 mt-1">
                A custom profile has been generated for your <strong>{activeExerciseObj.name}</strong>.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center space-x-2">
              <Timer className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-sm">Select Target Workout Timer</h3>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '1 Min', value: 60, desc: 'High Intensity' },
                { label: '2 Min', value: 120, desc: 'Hypertrophy' },
                { label: '5 Min', value: 300, desc: 'Endurance' }
              ].map((opt) => {
                const isSel = workoutDuration === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setWorkoutDuration(opt.value);
                      setTimerSeconds(opt.value);
                    }}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all duration-200 ${
                      isSel 
                        ? 'border-blue-500 bg-blue-50/50 text-blue-600 shadow-sm'
                        : 'border-slate-100 hover:border-slate-200 text-slate-500'
                    }`}
                  >
                    <span className="font-black text-sm">{opt.label}</span>
                    <span className="text-[8px] text-slate-400 font-medium mt-1">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => {
              setTimerSeconds(workoutDuration);
              setCurrentStep('active_workout');
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-2xl shadow-md shadow-blue-100 transition-all text-xs flex items-center justify-center gap-2"
          >
            <span>Proceed to Workout</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setCurrentStep('select_exercise')}
            className="w-full bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold py-3 px-6 rounded-2xl transition-all text-xs text-center border border-slate-100"
          >
            Back
          </button>
        </div>
      )}

      {/* STEP 4: ACTIVE TIMED WORKOUT */}
      {currentStep === 'active_workout' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
            <h2 className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
              <span>{activeExerciseObj.name} Set</span>
              <span className="bg-blue-50 text-blue-600 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                Active Workout
              </span>
            </h2>
          </div>

          {isSessionActive && !isCalibrating && (
            <div className="grid grid-cols-2 gap-4">
              {/* Giant Rep Counter */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Repetitions</span>
                <span className="text-6xl font-black text-slate-900 mt-2">
                  {(sessionData?.rep_count || 0).toString().padStart(2, '0')}
                </span>
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full mt-3">
                  Tracking Form
                </span>
              </div>

              {/* Countdown Timer */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col items-center justify-center text-center">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Time Remaining</span>
                <span className={`text-5xl font-black mt-3 font-mono ${timerSeconds < 10 ? 'text-rose-500 animate-pulse' : 'text-slate-800'}`}>
                  {formatTime(timerSeconds)}
                </span>
                <span className="text-[9px] text-slate-400 font-medium mt-3">seconds counting</span>
              </div>
            </div>
          )}

          {/* Sensor stream controller in timed workout mode */}
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
            modeFilter="workout"
          />

          {!isSessionActive && (
            <button
              onClick={() => setCurrentStep('workout_setup')}
              className="w-full bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold py-3 px-6 rounded-2xl transition-all text-xs text-center border border-slate-100"
            >
              Back to Configurations
            </button>
          )}
        </div>
      )}

      {/* STEP 5: SUMMARY REPORT */}
      {currentStep === 'report' && (
        <div className="space-y-6">
          <WorkoutReport 
            exercise={selectedExercise}
            sessionData={sessionData}
            onClose={() => {
              setCurrentStep('select_exercise');
              handleSessionReset();
            }}
          />
        </div>
      )}
    </Layout>
  );
}
export default App;
