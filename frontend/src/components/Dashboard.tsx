import { useState } from 'react';
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
import { CheckCircle2, AlertOctagon, Info, ChevronDown, ChevronUp, Activity, HelpCircle } from 'lucide-react';

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

interface DashboardProps {
  sessionData: SessionData | null;
  isSessionActive: boolean;
  exercise: string;
}

export function Dashboard({ sessionData, isSessionActive, exercise }: DashboardProps) {
  const [expandedRep, setExpandedRep] = useState<number | null>(null);

  if (!sessionData || sessionData.rep_count === 0) {
    return (
      <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-4 min-h-[300px]">
        <div className="bg-slate-50 text-slate-400 p-4 rounded-full flex items-center justify-center animate-pulse">
          <Activity className="w-8 h-8" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 text-base">Awaiting Exercise Stream</h3>
          <p className="text-xs text-slate-400 max-w-xs mt-1">
            {isSessionActive 
              ? "Start lifting. Repetitions will be automatically segmented and updated in real-time."
              : "Click 'Start Tracking' and perform reps to see biomechanical analysis."
            }
          </p>
        </div>
      </div>
    );
  }

  const { rep_count, reps, form_break_idx, recommended_ceiling, dominant_axis } = sessionData;
  const isFormDegraded = form_break_idx !== -1;

  // 1. Chart Configuration
  const chartLabels = reps.map((r) => `Rep ${r.rep_index}`);
  const compositeScores = reps.map((r) => r.composite_score);
  const cusumValues = reps.map((r) => r.cusum_value);

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'CUSUM Stat (Break Limit: 3.0)',
        data: cusumValues,
        borderColor: '#f43f5e', // Rose-500
        backgroundColor: 'rgba(244, 63, 94, 0.05)',
        borderWidth: 2,
        tension: 0.15,
        fill: true,
        pointBackgroundColor: reps.map((r) => 
          form_break_idx !== -1 && r.rep_index >= form_break_idx ? '#f43f5e' : '#cbd5e1'
        ),
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: 'Composite Form Error Score',
        data: compositeScores,
        borderColor: '#2563eb', // Blue-600
        borderWidth: 1.5,
        borderDash: [5, 5],
        tension: 0.1,
        pointBackgroundColor: '#2563eb',
        pointRadius: 3,
        fill: false,
      }
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { size: 10, weight: '500' },
          boxWidth: 10,
        }
      },
      tooltip: {
        padding: 10,
        titleFont: { size: 12, weight: 'bold' },
        bodyFont: { size: 11 },
      }
    },
    scales: {
      y: {
        grid: { color: '#f1f5f9' },
        ticks: { font: { size: 9 } },
        title: {
          display: true,
          text: 'Deviation / Score Magnitude',
          font: { size: 10, weight: 'bold' }
        }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 9 } }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Session Banner Alerts */}
      <div className={`p-4 border rounded-3xl flex items-start space-x-3.5 transition-all duration-200 ${
        isFormDegraded
          ? 'bg-rose-50/70 border-rose-100 text-rose-800'
          : 'bg-emerald-50/70 border-emerald-100 text-emerald-800'
      }`}>
        {isFormDegraded ? (
          <>
            <AlertOctagon className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-sm">Form Degradation Flagged</h3>
              <p className="text-xs mt-0.5 leading-relaxed">
                Significant biomechanical shift detected at <span className="font-bold">Repetition {form_break_idx}</span>. Set target ceiling to <span className="font-bold">{recommended_ceiling} reps</span> to prevent injury.
                {exercise === 'bicep_curl' && " Tip: Keep your elbows locked at your sides to prevent shoulder/back momentum."}
                {exercise === 'squat' && " Tip: Ensure you keep your knees tracking outward and hit parallel depth."}
                {exercise === 'overhead_press' && " Tip: Squeeze your glutes and brace your core to prevent lower back arching."}
              </p>
            </div>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-sm">Biomechanical Form Stable</h3>
              <p className="text-xs mt-0.5 leading-relaxed">
                Repetitions are consistent with baseline models. Dominant tracking axis: <span className="font-mono bg-emerald-100/50 px-1 py-0.5 rounded text-[10px] font-bold">{dominant_axis}</span>.
                {isSessionActive && " Keep pushing with controlled tempo."}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Completed</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{rep_count}</p>
          <span className="text-[9px] text-slate-400 font-medium">reps segmented</span>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Form Break Point</span>
          <p className={`text-2xl font-extrabold mt-1 ${isFormDegraded ? 'text-rose-500' : 'text-emerald-500'}`}>
            {isFormDegraded ? `Rep ${form_break_idx}` : 'None'}
          </p>
          <span className="text-[9px] text-slate-400 font-medium">via CUSUM shift</span>
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Target Cap</span>
          <p className="text-2xl font-extrabold text-blue-600 mt-1">
            {recommended_ceiling ? `${recommended_ceiling}` : 'N/A'}
          </p>
          <span className="text-[9px] text-slate-400 font-medium">reps ceiling limit</span>
        </div>
      </div>

      {/* Rep-by-Rep CUSUM Chart */}
      <div className="bg-white border border-slate-100 p-4 rounded-3xl shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-sm text-slate-900">Sequential Form Deviation</h3>
            <p className="text-[10px] text-slate-400 font-medium">Cumulative statistical sum (CUSUM) history</p>
          </div>
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full font-medium">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Threshold limit: 3.0</span>
          </div>
        </div>
        <div className="h-56">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Repetitions Breakdown list */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-slate-800 px-1">Repetition Analysis Breakdown</h3>
        <div className="space-y-2">
          {reps.map((rep) => {
            const isRepExpanded = expandedRep === rep.rep_index;
            const isRepFatigued = rep.classification === 'Fatigued';
            
            return (
              <div 
                key={rep.rep_index}
                className={`bg-white border rounded-2xl transition-all duration-200 ${
                  isRepExpanded ? 'shadow-sm border-slate-200' : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                {/* Header Summary */}
                <div 
                  onClick={() => setExpandedRep(isRepExpanded ? null : rep.rep_index)}
                  className="flex items-center justify-between p-3.5 cursor-pointer select-none"
                >
                  <div className="flex items-center space-x-3">
                    <span className="bg-slate-100 text-slate-600 text-xs font-extrabold w-6 h-6 rounded-full flex items-center justify-center">
                      {rep.rep_index}
                    </span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-xs text-slate-800">
                          Duration: {rep.features.duration.toFixed(2)}s
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isRepFatigued 
                            ? 'bg-rose-50 text-rose-600' 
                            : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {rep.classification}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        Jerk: {rep.features.jerk.toFixed(1)} | Instability: {(rep.features.instability_ratio * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* CUSUM alert tag */}
                    {form_break_idx !== -1 && rep.rep_index >= form_break_idx && (
                      <span className="bg-rose-50 text-rose-500 border border-rose-100 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">
                        Form Broken
                      </span>
                    )}
                    {isRepExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isRepExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-50 text-xs text-slate-600 space-y-3">
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl font-medium">
                      <div>
                        <span className="text-[9px] text-slate-400 block">Dominant Movement Plane</span>
                        <span className="text-slate-800">{rep.features.dominant_plane}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block">Primary Degrading Plane</span>
                        <span className={`text-slate-800 ${isRepFatigued ? 'text-rose-600 font-bold' : ''}`}>
                          {rep.features.degrading_plane}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1.5">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">Peak-to-Peak Displacement</span>
                        <span className="font-semibold text-slate-800">{rep.features.displacement_p2p.toFixed(3)} m</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">Instability Energy Ratio</span>
                        <span className="font-semibold text-slate-800">{(rep.features.instability_ratio * 100).toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">FFT Accel Peak Frequency</span>
                        <span className="font-semibold text-slate-800">{rep.features.fft_accel_mag.toFixed(2)} Hz</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">FFT Gyro Peak Frequency</span>
                        <span className="font-semibold text-slate-800">{rep.features.fft_gyro_mag.toFixed(2)} Hz</span>
                      </div>
                    </div>

                    {/* RMS Sub-Axes */}
                    <div className="pt-2">
                      <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Per-Axis RMS Amplitude</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-50 p-2 rounded-xl text-center">
                          <span className="text-[9px] text-slate-400 block">X (Lateral)</span>
                          <span className="font-semibold text-[11px] text-slate-800">{rep.features.rms_accel_x.toFixed(2)} m/s²</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-xl text-center">
                          <span className="text-[9px] text-slate-400 block">Y (Vertical)</span>
                          <span className="font-semibold text-[11px] text-slate-800">{rep.features.rms_accel_y.toFixed(2)} m/s²</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-xl text-center">
                          <span className="text-[9px] text-slate-400 block">Z (Anteroposterior)</span>
                          <span className="font-semibold text-[11px] text-slate-800">{rep.features.rms_accel_z.toFixed(2)} m/s²</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
export default Dashboard;
