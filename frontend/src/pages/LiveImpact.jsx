import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Zap, 
  Droplets, 
  Leaf, 
  Activity, 
  Globe, 
  Users 
} from "lucide-react";
import { api } from "../services/api.js";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";

const USER_ID = 1;

// Sample 7-day data (replicated from dashboard for consistency)
const impactHistory = [
  { day: "Day 1", value: 2.1 },
  { day: "Day 2", value: 4.3 },
  { day: "Day 3", value: 3.8 },
  { day: "Day 4", value: 6.2 },
  { day: "Day 5", value: 8.5 },
  { day: "Day 6", value: 7.1 },
  { day: "Day 7", value: 10.4 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-card/90 backdrop-blur-md border border-border-color p-3 rounded-xl shadow-xl">
        <p className="text-xs font-bold text-muted mb-1">{label}</p>
        <p className="text-sm font-bold text-green-brand">
          {payload[0].value.toFixed(1)} kg CO₂e Saved
        </p>
      </div>
    );
  }
  return null;
};

export const LiveImpact = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.history(USER_ID).then(setHistory).finally(() => setLoading(false));
  }, []);

  const totalSaved = history.reduce((sum, item) => sum + (item.carbon_score || 0), 0);
  const dailyAverage = history.length > 0 ? totalSaved / history.length : 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold">Live Impact</h2>
          <p className="text-muted">Your contribution to a sustainable future</p>
        </div>
        <div className="flex items-center gap-2 bg-accent-soft px-4 py-2 rounded-full border border-accent/20">
          <Activity size={16} className="text-accent animate-pulse" />
          <span className="text-xs font-bold text-accent">Tracking Active</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Hero Impact Card */}
        <div className="col-span-12 card bg-green-dark text-white border-none p-8 flex items-center justify-between overflow-hidden relative">
          <div className="relative z-10">
            <div className="text-green-100 text-sm font-bold mb-2 uppercase tracking-widest">Total Carbon Offset</div>
            <div className="text-6xl font-black mb-4 flex items-baseline gap-2">
              {totalSaved.toFixed(1)} <span className="text-2xl text-green-200">kg CO₂e</span>
            </div>
            <p className="text-green-100 max-w-md">
              That's equivalent to planting <strong>{Math.ceil(totalSaved / 20)}</strong> trees this year. Your choices today are building a cooler planet for tomorrow.
            </p>
          </div>
          <div className="relative z-10 w-48 h-48 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-md">
            <Globe size={100} className="text-white/20" />
          </div>
          {/* Decorative circles */}
          <div className="absolute top-[-20%] right-[-10%] w-96 h-96 bg-white/5 rounded-full"></div>
          <div className="absolute bottom-[-10%] left-[-5%] w-64 h-64 bg-black/5 rounded-full"></div>
        </div>

        {/* Action Grid */}
        <div className="col-span-8 grid grid-cols-3 gap-6">
          <div className="card flex flex-col items-center text-center p-6 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent flex items-center justify-center">
              <Leaf size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold">85%</div>
              <div className="text-xs text-muted">Eco-Score</div>
            </div>
          </div>
          <div className="card flex flex-col items-center text-center p-6 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
              <Zap size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold">14.2</div>
              <div className="text-xs text-muted">kWh Saved</div>
            </div>
          </div>
          <div className="card flex flex-col items-center text-center p-6 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Droplets size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold">4.8</div>
              <div className="text-xs text-muted">Liters Saved</div>
            </div>
          </div>

          <div className="card col-span-3 min-h-[300px]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold flex items-center gap-2">
                <TrendingUp size={18} className="text-green-brand" />
                Impact Growth
              </h3>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-brand animate-pulse"></span>
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Real-time Trend</span>
              </div>
            </div>
            
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={impactHistory}>
                  <defs>
                    <linearGradient id="impactGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis 
                    dataKey="day" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: 'var(--text-muted)', fontSize: 10}} 
                  />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="var(--accent)" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#impactGradient)" 
                    animationDuration={1500}
                    activeDot={{ r: 6, fill: 'var(--accent)', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Community Insight */}
        <div className="col-span-4 flex flex-col gap-6">
          <div className="card flex-1 flex flex-col gap-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Users size={18} className="text-blue-500" />
              Community Status
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">12k</div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-gray-900">Total Users Active</div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-blue-500 w-[78%]"></div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">4.2t</div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-gray-900">CO₂ Saved Collectively</div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-green-500 w-[62%]"></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-auto p-4 bg-gray-50 rounded-2xl text-[10px] text-gray-500 leading-relaxed">
              Your contribution represents <strong>0.02%</strong> of the total community impact. Keep it up to climb the local rankings!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
