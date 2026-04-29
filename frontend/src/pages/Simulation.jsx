import React, { useState } from "react";
import { FlaskConical, Play, TrendingDown, Bike, Car, Bus, Train, Info } from "lucide-react";
import { api } from "../services/api.js";

export const Simulation = () => {
  const [params, setParams] = useState({ current: "cab", alternative: "bike", distance: 10 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = async () => {
    setLoading(true);
    try {
      const data = await api.simulate({
        current: params.current,
        alternative: params.alternative,
        distance_km: params.distance
      });
      setResult(data);
    } catch (err) {
      console.error("Simulation failed", err);
    } finally {
      setLoading(false);
    }
  };

  const modes = [
    { id: "walk", icon: "🚶" },
    { id: "bike", icon: "🚲" },
    { id: "bus", icon: "🚌" },
    { id: "metro", icon: "🚇" },
    { id: "train", icon: "🚆" },
    { id: "cab", icon: "🚗" }
  ];

  return (
    <div className="flex flex-col gap-6 animate-in zoom-in-95 duration-500">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Simulation Lab</h2>
        <p className="text-gray-500">Project your impact across different transportation scenarios</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Control Panel */}
        <div className="card col-span-4 flex flex-col gap-8">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <FlaskConical size={18} className="text-purple-500" />
            Experiment Parameters
          </h3>

          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Baseline Transport</label>
              <div className="grid grid-cols-3 gap-2">
                {modes.map(m => (
                  <button 
                    key={m.id}
                    onClick={() => setParams({...params, current: m.id})}
                    className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-1 ${params.current === m.id ? 'bg-purple-50 border-purple-200 text-purple-700 shadow-sm' : 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50'}`}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <span className="text-[10px] font-bold capitalize">{m.id}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Eco Alternative</label>
              <div className="grid grid-cols-3 gap-2">
                {modes.map(m => (
                  <button 
                    key={m.id}
                    onClick={() => setParams({...params, alternative: m.id})}
                    className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-1 ${params.alternative === m.id ? 'bg-green-50 border-green-200 text-green-700 shadow-sm' : 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50'}`}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <span className="text-[10px] font-bold capitalize">{m.id}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Trip Distance</label>
                <span className="text-sm font-black text-purple-700">{params.distance} km</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="50" 
                step="1"
                value={params.distance}
                onChange={e => setParams({...params, distance: parseInt(e.target.value)})}
                className="w-full accent-purple-600 h-1.5 bg-gray-100 rounded-full appearance-none cursor-pointer"
              />
            </div>
          </div>

          <button 
            onClick={handleSimulate}
            disabled={loading}
            className="w-full btn-primary py-4 bg-purple-600 hover:bg-purple-700 mt-auto"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <><Play size={18} fill="currentColor" /> Run Simulation</>}
          </button>
        </div>

        {/* Results Panel */}
        <div className="col-span-8 flex flex-col gap-6">
          <div className="card flex-1 flex flex-col justify-center items-center text-center p-12 bg-gradient-to-br from-white to-purple-50/30">
            {result ? (
              <div className="w-full space-y-12 animate-in fade-in slide-in-from-top-4 duration-500">
                <div>
                  <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2">Simulated Emission Savings</div>
                  <div className="text-7xl font-black text-gray-900 flex items-baseline justify-center gap-3">
                    {result.emissions_saved?.toFixed(1) || "4.2"}
                    <span className="text-2xl text-purple-300">kg CO₂e</span>
                  </div>
                  <div className="text-green-600 font-bold text-sm mt-2 flex items-center justify-center gap-1">
                    <TrendingDown size={16} />
                    {((result.emissions_saved / (result.emissions_saved + result.current_emissions)) * 100).toFixed(0)}% Reduction achieved
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-12 pt-8 border-t border-purple-100">
                  <div className="flex flex-col items-center">
                    <div className="text-xs font-bold text-gray-400 uppercase mb-4">Points Gain</div>
                    <div className="text-4xl font-black text-yellow-500">+{result.potential_points || 45}</div>
                    <div className="text-[10px] text-gray-400 mt-1">pts for this switch</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-xs font-bold text-gray-400 uppercase mb-4">Tree Equivalent</div>
                    <div className="text-4xl font-black text-green-600">{Math.ceil(result.emissions_saved * 5 || 21)}</div>
                    <div className="text-[10px] text-gray-400 mt-1">leaves protected</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 opacity-40">
                <FlaskConical size={80} strokeWidth={1} />
                <div>
                  <h4 className="text-xl font-bold text-gray-900">Ready for Simulation</h4>
                  <p className="text-sm max-w-xs mx-auto">Configure your parameters and run the engine to see the impact of your choices.</p>
                </div>
              </div>
            )}
          </div>

          <div className="card bg-purple-900 text-white p-6 border-none flex items-start gap-4">
            <Info size={24} className="text-purple-300 shrink-0" />
            <div>
              <h4 className="font-bold text-purple-100 mb-1 text-sm">Did you know?</h4>
              <p className="text-xs text-purple-200 leading-relaxed">
                If everyone in Delhi switched from Cabs to Metro for just 10% of their trips, we would collectively save over 500,000 tons of CO₂ emissions annually. Small changes, massive impact!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
