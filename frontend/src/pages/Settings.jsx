import React, { useState, useEffect } from "react";
import { Settings as SettingsIcon, Bell, Shield, User, Globe, Save, Check, Bike, Car, Bus, Train } from "lucide-react";
import { api } from "../services/api.js";

const USER_ID = 1;

export const SettingsPage = () => {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState({
    transport_priority: "eco",
    urgency_default: "normal",
    notifications: true,
    theme: "light",
    privacy_mode: false,
    default_mode: "metro"
  });

  useEffect(() => {
    api.preferences(USER_ID).then(data => {
      if (data) setPrefs(prev => ({...prev, ...data}));
    }).catch(err => console.warn("No preferences found, using defaults"));
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.savePreferences({
        user_id: USER_ID,
        ...prefs
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert("Failed to save preferences");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
          <p className="text-gray-500">Manage your account and platform preferences</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={loading}
          className={`btn-primary px-8 transition-all ${saved ? 'bg-green-600' : ''}`}
        >
          {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <><Check size={18} /> Saved!</> : <><Save size={18} /> Save Changes</>}
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Profile Section */}
        <div className="card col-span-4 flex flex-col items-center text-center p-8 gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-green-dark text-white flex items-center justify-center text-3xl font-black shadow-xl">
              A
            </div>
            <div className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-lg border border-gray-100 flex items-center justify-center text-gray-400 hover:text-green-brand cursor-pointer transition-colors">
              <User size={16} />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Aarav Sharma</h3>
            <p className="text-sm text-gray-500">Green Guardian since April 2026</p>
          </div>
          <div className="w-full pt-6 border-t border-gray-100 grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-lg font-black text-gray-900">2795</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Points</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-gray-900">Level 4</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Rank</div>
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="col-span-8 flex flex-col gap-6">
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <SettingsIcon size={18} className="text-gray-500" />
              AI Recommendation Preferences
            </h3>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Transport Priority</label>
                  <select 
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-green-300 transition-colors text-sm font-bold"
                    value={prefs.transport_priority}
                    onChange={e => setPrefs({...prefs, transport_priority: e.target.value})}
                  >
                    <option value="eco">Lowest Carbon Footprint</option>
                    <option value="fastest">Shortest Travel Time</option>
                    <option value="balanced">Balanced (Eco + Time)</option>
                    <option value="cheapest">Least Cost</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Default Urgency</label>
                  <select 
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-green-300 transition-colors text-sm font-bold"
                    value={prefs.urgency_default}
                    onChange={e => setPrefs({...prefs, urgency_default: e.target.value})}
                  >
                    <option value="high">I'm usually in a rush</option>
                    <option value="normal">Standard schedule</option>
                    <option value="low">I prefer eco over speed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Excluded Modes (Always skip these)</label>
                <div className="flex gap-2">
                  {['walk', 'bike', 'bus', 'metro', 'cab'].map(mode => (
                    <div key={mode} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 text-xs font-bold text-gray-600 capitalize">
                      <input type="checkbox" className="accent-green-brand" />
                      {mode}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Bell size={18} className="text-orange-400" />
              Notifications & Privacy
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div>
                  <div className="text-sm font-bold text-gray-900">Push Notifications</div>
                  <div className="text-[10px] text-gray-500">Get alerts for high AQI and trip reminders</div>
                </div>
                <div 
                  onClick={() => setPrefs({...prefs, notifications: !prefs.notifications})}
                  className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${prefs.notifications ? 'bg-green-brand' : 'bg-gray-300'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${prefs.notifications ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div>
                  <div className="text-sm font-bold text-gray-900">Privacy Mode</div>
                  <div className="text-[10px] text-gray-500">Hide my name on the global leaderboard</div>
                </div>
                <div 
                  onClick={() => setPrefs({...prefs, privacy_mode: !prefs.privacy_mode})}
                  className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${prefs.privacy_mode ? 'bg-green-brand' : 'bg-gray-300'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${prefs.privacy_mode ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
