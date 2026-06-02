import { Award, AlertTriangle, ShieldAlert, Sparkles, CheckCircle, Flame, Info, Activity } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

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

interface WorkoutReportProps {
  exercise: string;
  sessionData: SessionData | null;
  onClose: () => void;
}

// Exercise names for display
const exerciseNames: Record<string, string> = {
  bicep_curl: 'Bicep Curls',
  squat: 'Barbell/Bodyweight Squats',
  overhead_press: 'Overhead Shoulder Press'
};

export function WorkoutReport({ exercise, sessionData, onClose }: WorkoutReportProps) {
  // --- EMPTY STATE: null session or zero reps ---
  if (!sessionData || sessionData.rep_count === 0) {
    return (
      <div className="bg-white w-full rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center space-x-2.5">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="font-extrabold text-slate-950 text-sm">Workout Summary Report</h2>
            <p className="text-[10px] text-slate-400 font-medium">{exerciseNames[exercise] || 'Exercise'}</p>
          </div>
        </div>

        {/* Empty state body */}
        <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className="bg-slate-100 text-slate-400 p-5 rounded-full">
            <Activity className="w-10 h-10" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">No Repetitions Detected</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              The session ended before any reps could be segmented. Make sure your phone is securely mounted and the engine is connected before starting.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-left w-full">
            <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
              <span className="font-bold">Tip:</span> Hold a rep for at least 0.8s. The engine needs ~1.5s of data before detecting the first rep.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-2xl font-bold text-xs shadow-md shadow-blue-100 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { rep_count, reps, form_break_idx, recommended_ceiling } = sessionData;

  // 1. Calculate Biomechanical Performance Score
  let score = 100;
  if (form_break_idx !== -1) {
    const cleanRatio = (form_break_idx - 1) / rep_count;
    score = Math.round(10 + cleanRatio * 70);
  } else {
    const avgInstability = reps.reduce((acc, r) => acc + r.features.instability_ratio, 0) / reps.length;
    const avgJerk = reps.reduce((acc, r) => acc + r.features.jerk, 0) / reps.length;
    const instabilityPen = Math.min(15, avgInstability * 40);
    const jerkPen = Math.min(15, Math.max(0, avgJerk - 10) * 0.15);
    score = Math.round(100 - instabilityPen - jerkPen);
  }
  score = Math.max(10, Math.min(100, score));

  let scoreColor = 'text-emerald-600 bg-emerald-50 border-emerald-100';
  let scoreLabel = 'Elite Form';
  if (score < 70) {
    scoreColor = 'text-rose-600 bg-rose-50 border-rose-100';
    scoreLabel = 'Needs Correction';
  } else if (score < 90) {
    scoreColor = 'text-amber-600 bg-amber-50 border-amber-100';
    scoreLabel = 'Acceptable Form';
  }

  // 2. Exercise-specific diagnostics
  const getDiagnostics = () => {
    switch (exercise) {
      case 'bicep_curl':
        return {
          title: 'Bicep Curl Diagnostics',
          target: 'Biceps & Forearms',
          observation: form_break_idx !== -1 
            ? `Form began breaking at Rep ${form_break_idx} due to forearm instability and speed spikes. This indicates you started swinging your elbows forward or utilizing back momentum.`
            : 'Your forearm trajectory remained extremely stable throughout the set. Excellent elbow placement!',
          advice: [
            'Keep your elbows pinned to your ribcage. Do not let them drift forward as you lift.',
            'Maintain a 2-second concentric (upward) and 2-second eccentric (downward) tempo.',
            'Ensure your wrists remain neutral; avoid curling the wrist at the top of the range.'
          ]
        };
      case 'squat':
        return {
          title: 'Squat Diagnostics',
          target: 'Quads, Glutes & Hamstrings',
          observation: form_break_idx !== -1
            ? `Form shifted at Rep ${form_break_idx}. We detected a drop in peak-to-peak vertical displacement and lateral sway, indicating reduced depth or knee collapse.`
            : 'Excellent depth consistency and lateral stability. You maintained proper knee alignment!',
          advice: [
            'Focus on pushing your knees outward as you descend to prevent valgus knee caving.',
            'Ensure you hit depth (thighs parallel to the ground) on every single repetition.',
            'Keep your weight centered over the middle of your feet, driving straight up through your heels.'
          ]
        };
      case 'overhead_press':
        return {
          title: 'Overhead Press Diagnostics',
          target: 'Shoulders, Triceps & Core',
          observation: form_break_idx !== -1
            ? `Instability detected at Rep ${form_break_idx}. Increased anteroposterior (Z-axis) sway suggests you started arching your lower back to complete the press.`
            : 'Outstanding bar path stability. Your trunk remained rigid and the press trajectory stayed vertical.',
          advice: [
            'Brace your core and squeeze your glutes hard before initiating the lift to stabilize the spine.',
            'Press the phone/barbell in a straight vertical line, pushing your head slightly forward at lockout.',
            'Control the descent. Avoid dropping the weight rapidly back to your shoulders.'
          ]
        };
      default:
        return {
          title: 'Exercise Diagnostics',
          target: 'Core musculature',
          observation: 'Biomechanical signals successfully logged and analyzed.',
          advice: ['Maintain standard safety parameters.', 'Avoid using excessive momentum.']
        };
    }
  };

  const diagnostics = getDiagnostics();

  // Chart configuration
  const chartLabels = reps.map((r) => `Rep ${r.rep_index}`);
  const compositeScores = reps.map((r) => r.composite_score);
  const cusumValues = reps.map((r) => r.cusum_value);

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'CUSUM Deviation (Limit: 3.0)',
        data: cusumValues,
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.07)',
        borderWidth: 2.5,
        tension: 0.2,
        fill: true,
        pointBackgroundColor: reps.map((r) => 
          form_break_idx !== -1 && r.rep_index >= form_break_idx ? '#f43f5e' : '#cbd5e1'
        ),
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: 'Form Error Score',
        data: compositeScores,
        borderColor: '#2563eb',
        borderWidth: 2,
        borderDash: [4, 4],
        tension: 0.1,
        pointBackgroundColor: '#2563eb',
        pointRadius: 3,
        fill: false,
      }
    ],
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { size: 9, weight: 'bold' },
          boxWidth: 8,
        }
      },
      tooltip: {
        padding: 8,
        titleFont: { size: 10, weight: 'bold' },
        bodyFont: { size: 9 },
      }
    },
    scales: {
      y: {
        grid: { color: '#f1f5f9' },
        ticks: { font: { size: 8 } },
        title: {
          display: true,
          text: 'Deviation / Error Score',
          font: { size: 9, weight: 'bold' }
        }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 8 } }
      }
    }
  };

  return (
    <div className="bg-white w-full rounded-3xl border border-slate-100 overflow-hidden flex flex-col shadow-sm">
      {/* Header */}
      <div className="relative px-6 py-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 shrink-0 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <Sparkles className="w-5 h-5 text-blue-600 animate-pulse" />
          <div>
            <h2 className="font-extrabold text-slate-950 text-sm">Workout Summary Report</h2>
            <p className="text-[10px] text-slate-400 font-medium">{exerciseNames[exercise] || 'Exercise'}</p>
          </div>
        </div>
        {/* Score badge in header */}
        <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-full border-4 bg-white shadow-inner ${
          score >= 90 ? 'border-emerald-500' : score >= 70 ? 'border-amber-400' : 'border-rose-500'
        }`}>
          <span className="text-xl font-black text-slate-800 leading-none">{score}</span>
          <span className="text-[7px] text-slate-400 font-bold uppercase tracking-wide">Score</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-5">
        {/* Score label + summary */}
        <div className="flex items-center space-x-4 bg-slate-50/60 p-4 rounded-2xl border border-slate-100">
          <div className="space-y-1 flex-1">
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${scoreColor}`}>
              {scoreLabel}
            </span>
            <h3 className="font-extrabold text-slate-800 text-xs">Biomechanical Stability</h3>
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              Based on {rep_count} segmented repetition{rep_count !== 1 ? 's' : ''} vs. calibrated baseline.
            </p>
          </div>
          <Award className={`w-8 h-8 shrink-0 ${score >= 90 ? 'text-emerald-500' : score >= 70 ? 'text-amber-400' : 'text-rose-400'}`} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-slate-100 p-3.5 rounded-xl text-center bg-slate-50/30">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Completed Reps</span>
            <p className="text-xl font-extrabold text-slate-800 mt-1">
              {rep_count} <span className="text-xs font-semibold text-slate-400">Reps</span>
            </p>
          </div>
          
          <div className="border border-slate-100 p-3.5 rounded-xl text-center bg-slate-50/30">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Form Breakpoint</span>
            {form_break_idx !== -1 ? (
              <p className="text-xl font-extrabold text-rose-500 mt-1">Rep {form_break_idx}</p>
            ) : (
              <p className="text-xl font-extrabold text-emerald-500 mt-1 flex items-center justify-center gap-1">
                <CheckCircle className="w-4 h-4 inline" /> None
              </p>
            )}
          </div>

          {form_break_idx !== -1 && recommended_ceiling && (
            <div className="col-span-2 bg-rose-50/40 border border-rose-100/50 p-3.5 rounded-xl flex items-start space-x-2.5 text-rose-900">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-[10.5px] leading-relaxed font-medium">
                <span className="font-extrabold">Form Ceiling Alert:</span> Restrict your sets to <span className="font-extrabold">{recommended_ceiling} repetitions</span> to avoid injury. Beyond this point, muscle fatigue leads to high spinal/joint strain.
              </div>
            </div>
          )}
        </div>

        {/* CUSUM & Error Graph */}
        <div className="bg-slate-50/30 border border-slate-100 p-4 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-xs text-slate-900">Sequential Rep Stability</h3>
              <p className="text-[9px] text-slate-400 font-medium">Form deflection sum relative to baseline</p>
            </div>
            <div className="flex items-center space-x-1 text-[9px] text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full font-bold">
              <Info className="w-3 h-3" />
              <span>Limit: 3.0</span>
            </div>
          </div>
          <div className="h-44">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Diagnostics */}
        <div className="space-y-2.5">
          <h4 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider px-1">Biomechanical Diagnostics</h4>
          <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl space-y-2.5 text-xs text-slate-600">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Muscles Checked</span>
              <span className="font-bold text-slate-800">{diagnostics.target}</span>
            </div>
            <div className="border-t border-slate-100 pt-2.5 leading-relaxed">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Observation</span>
              <p>{diagnostics.observation}</p>
            </div>
          </div>
        </div>

        {/* Form Correction Plan */}
        <div className="space-y-3">
          <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider px-1 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-500" /> Form Correction Plan
          </h4>
          <ul className="space-y-2">
            {diagnostics.advice.map((tip, idx) => (
              <li key={idx} className="flex items-start space-x-2.5 text-xs text-slate-600 leading-relaxed">
                <span className="bg-blue-50 text-blue-600 font-extrabold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px]">
                  {idx + 1}
                </span>
                <p className="text-[11px] text-slate-500 font-medium">{tip}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Rep classification summary */}
        <div className="bg-slate-50/30 border border-slate-100 p-4 rounded-2xl">
          <h4 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-3">Rep Classification</h4>
          <div className="flex flex-wrap gap-2">
            {reps.map((r) => (
              <span
                key={r.rep_index}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border ${
                  r.classification === 'Fatigued'
                    ? 'bg-rose-50 text-rose-600 border-rose-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                } ${form_break_idx !== -1 && r.rep_index >= form_break_idx ? 'ring-1 ring-rose-400' : ''}`}
              >
                #{r.rep_index} {r.classification === 'Fatigued' ? '⚠️' : '✓'}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 shrink-0 flex gap-3">
        <button
          onClick={onClose}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-2xl font-bold text-xs shadow-md shadow-blue-100 transition-colors"
        >
          Start New Session
        </button>
      </div>
    </div>
  );
}

export default WorkoutReport;
