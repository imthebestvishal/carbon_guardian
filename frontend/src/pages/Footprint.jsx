import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Leaf, Plus, History, TrendingDown, Info } from "lucide-react";
import { api } from "../services/api.js";

const USER_ID = 1;

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6"];

export const Footprint = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newActivity, setNewActivity] = useState({ type: "travel", value: "", action: "" });

  const [breakdown, setBreakdown] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [scoreData, userData] = await Promise.all([
        api.carbonScore(USER_ID),
        api.user(USER_ID)
      ]);
      setBreakdown(scoreData?.breakdown);
      setHistory(userData?.recent_activity || []);
    } catch (err) {
      console.error("Failed to load footprint data", err);
    } finally {
      setLoading(false);
    }
  };

  const displayData = breakdown ? [
    { name: "Travel", value: breakdown.transport },
    { name: "Energy", value: breakdown.energy },
    { name: "Waste", value: breakdown.waste },
    { name: "Food", value: 0 } // Default for now
  ].filter(i => i.value > 0) : [
    { name: "Travel", value: 40 },
    { name: "Energy", value: 30 },
    { name: "Waste", value: 20 }
  ];

  const handleAddActivity = async (e) => {
    e.preventDefault();
    try {
      await api.trackAction({
        user_id: USER_ID,
        action: newActivity.type, // Map type directly to backend-supported actions
        accepted: true,
        distance_km: newActivity.type === "travel" ? parseFloat(newActivity.value) : 0,
        energy_kwh: newActivity.type === "energy" ? parseFloat(newActivity.value) : 0,
        waste_kg: newActivity.type === "waste" ? parseFloat(newActivity.value) : 0,
      });
      setShowAddForm(false);
      loadData();
    } catch (err) {
      alert("Failed to add activity: " + err.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">My Footprint</h2>
          <p className="text-gray-500">Track and analyze your environmental impact</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="btn-primary"
        >
          <Plus size={18} />
          Add Activity
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Emissions Breakdown */}
        <div className="card col-span-7 flex flex-col h-[400px]">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingDown size={18} className="text-green-brand" />
            Emissions Breakdown
          </h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={displayData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {displayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Summary */}
        <div className="card col-span-5">
          <h3 className="font-bold text-gray-900 mb-4">Daily Tracker</h3>
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center justify-between">
              <div>
                <div className="text-xs text-green-700 font-bold uppercase tracking-wider">Today's Savings</div>
                <div className="text-2xl font-black text-green-900">12.4 kg</div>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                <Leaf size={24} />
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Goal Progress</span>
                <span className="font-bold text-gray-900">62%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-brand w-[62%] transition-all duration-1000"></div>
              </div>
              <p className="text-[10px] text-gray-400 italic">You're 3.6 kg away from your daily goal!</p>
            </div>
          </div>
        </div>

        {/* Recent History */}
        <div className="card col-span-12">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <History size={18} className="text-gray-500" />
            Recent Activities
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-50">
                  <th className="pb-3 font-medium">Activity</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium text-right">Impact</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                {history.length > 0 ? history.slice(0, 5).map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 font-semibold text-gray-900 capitalize">{item.action}</td>
                    <td className="py-3 capitalize">{item.accepted ? "Completed" : "Planned"}</td>
                    <td className="py-3 text-xs">{item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Today'}</td>
                    <td className="py-3 text-right font-bold text-green-600">-{item.carbon_score?.toFixed(1)} kg</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="4" className="py-8 text-center text-gray-400">No activities found. Start logging!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-[400px] shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Add New Activity</h2>
            <form onSubmit={handleAddActivity} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Activity Type</label>
                <select 
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-green-300 transition-colors"
                  value={newActivity.type}
                  onChange={e => setNewActivity({...newActivity, type: e.target.value})}
                >
                  <option value="travel">Transport / Travel</option>
                  <option value="energy">Energy Consumption</option>
                  <option value="waste">Waste Management</option>
                  <option value="food">Sustainable Food</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Activity Name</label>
                <input 
                  type="text"
                  placeholder="e.g. Morning commute via Metro"
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-green-300 transition-colors"
                  value={newActivity.action}
                  onChange={e => setNewActivity({...newActivity, action: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Value (km or kg)</label>
                <input 
                  type="number"
                  placeholder="Enter numerical value"
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-green-300 transition-colors"
                  value={newActivity.value}
                  onChange={e => setNewActivity({...newActivity, value: e.target.value})}
                  required
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" className="flex-1 btn-outline" onClick={() => setShowAddForm(false)}>Cancel</button>
                <button type="submit" className="flex-1 btn-primary">Save Activity</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
