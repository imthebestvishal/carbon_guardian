import React, { Suspense, useState, useEffect } from "react";
import { 
  MapPin, 
  CloudSun, 
  Thermometer, 
  CalendarDays, 
  Navigation, 
  Bot, 
  Check, 
  X, 
  Leaf, 
  Zap, 
  Droplets, 
  Bike, 
  Car, 
  ArrowRight,
  Loader2,
  Trophy,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area
} from "recharts";

// Lazy-load heavy Leaflet map
const LazyMap = React.lazy(() =>
  import("../components/Map.jsx").then((mod) => ({ default: mod.Map }))
);

// Sample 7-day data
const impactHistory = [
  { day: "Mon", value: 2.1 },
  { day: "Tue", value: 4.3 },
  { day: "Wed", value: 3.8 },
  { day: "Thu", value: 6.2 },
  { day: "Fri", value: 8.5 },
  { day: "Sat", value: 7.1 },
  { day: "Sun", value: 10.4 },
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

function MapFallback() {
  return (
    <div style={{ height: "100%", width: "100%", minHeight: "180px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-soft)", borderRadius: "12px" }}>
      <Loader2 size={24} className="animate-spin text-gray-400" />
    </div>
  );
}

export default function Dashboard({ 
  user, 
  environment, 
  tripDetails, 
  destInput, 
  suggestions, 
  recommendation, 
  impactData, 
  todayFormatted, 
  todayWeekday,
  handleInputChange,
  handleTripSearch,
  preloadPopularPlaces,
  handleSelect,
  handleAction,
  setShowCompare,
  setShowInfo,
  showCompare,
  showInfo
}) {
  const [status, setStatus] = useState("idle"); // idle | loading | accepted | dismissed

  const onAccept = async () => {
    const action = recommendation?.recommended_action || recommendation?.top_action;
    if (!action) return;
    
    setStatus("loading");
    try {
      await handleAction(action, true);
      setStatus("accepted");
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#10b981', '#ffffff']
      });
    } catch (err) {
      setStatus("idle");
    }
  };

  const onDismiss = async () => {
    const action = recommendation?.recommended_action || recommendation?.top_action;
    if (!action) return;
    
    try {
      await handleAction(action, false);
      setStatus("dismissed");
    } catch (err) {
      // Even if backend fails, hide it for UX
      setStatus("dismissed");
    }
  };

  return (
    <>
      {/* Header Section */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            Good Morning, {user.name}! <span className="text-yellow-400">👋</span>
          </h2>
          <p className="text-muted mt-1 text-sm">Together, build a cooler and greener planet.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="pill">
            <Leaf className="text-green-brand" size={18} />
            <div>
              <div className="text-xs text-muted font-medium">Green Points</div>
              <div className="font-bold text-lg leading-tight">{user.green_points}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 px-2 pr-4 rounded-full border border-border-color shadow-sm cursor-pointer transition-colors bg-bg-card">
            <div className="w-10 h-10 rounded-full bg-green-dark text-white flex items-center justify-center font-bold">
              {user.name.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-bold">Hi, {user.name}</div>
              <div className="text-xs text-muted">Streak {user.streak_days} day{user.streak_days !== 1 ? 's' : ''}</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-2 text-gray-400"><path d="M6 9l6 6 6-6"/></svg>
          </div>
        </div>
      </header>

      {/* Context Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card py-3 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-brand">
            <MapPin size={20} />
          </div>
          <div>
            <div className="text-xs text-muted font-medium">Location</div>
            <div className="font-bold text-sm truncate" title={tripDetails.from}>{tripDetails.from}</div>
            <div className="text-xs text-muted/60">({tripDetails.fromCoords.lat.toFixed(4)}, {tripDetails.fromCoords.lon.toFixed(4)})</div>
          </div>
        </div>
        
        <div className="card py-3 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
            <CloudSun size={20} />
          </div>
          <div>
            <div className="text-xs text-muted font-medium">Live City AQI</div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{environment.aqi}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${environment.aqi > 100 ? 'bg-red-500/10 text-red-500' : 'bg-orange-brand/10 text-orange-brand'}`}>{environment.aqi_label}</span>
            </div>
          </div>
        </div>

        <div className="card py-3 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-brand">
            <Thermometer size={20} />
          </div>
          <div>
            <div className="text-xs text-muted font-medium">Temperature</div>
            <div className="font-bold text-sm">{environment.temperature.toFixed(1)}°C <span className="text-muted font-normal text-[10px]">Clear Sky</span></div>
          </div>
        </div>

        <div className="card py-3 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500">
            <CalendarDays size={20} />
          </div>
          <div>
            <div className="text-xs text-muted font-medium">Today</div>
            <div className="font-bold text-sm">{todayFormatted}</div>
            <div className="text-xs text-muted/60">{todayWeekday}</div>
          </div>
        </div>
      </div>

      {/* Trip Details Card */}
      <div className="card p-0 overflow-hidden">
        <div className="flex">
          <div className="flex-1 p-5 grid grid-cols-3 gap-8">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-green-success shadow-[0_0_0_4px_rgba(20,184,166,0.2)]"></div>
              <div>
                <div className="text-xs text-muted mb-0.5">From</div>
                <div className="font-bold text-sm">{tripDetails.from}</div>
                <div className="text-xs text-muted/60 mt-0.5">({tripDetails.fromCoords.lat.toFixed(4)}, {tripDetails.fromCoords.lon.toFixed(4)})</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3 pl-8 border-l border-border-color">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.2)]"></div>
              <div>
                <div className="text-xs text-muted mb-0.5">To</div>
                <div className="relative">
                  <input 
                    type="text"
                    placeholder="Enter destination..."
                    className="font-bold text-sm whitespace-pre-line leading-tight bg-transparent border-none outline-none p-0 w-full text-main"
                    value={destInput}
                    onChange={handleInputChange}
                    onKeyDown={handleTripSearch}
                    onFocus={preloadPopularPlaces}
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 bg-bg-card shadow-lg border border-border-color rounded-md w-64 z-50 overflow-hidden max-h-48 overflow-y-auto">
                      {suggestions.map((item, index) => (
                        <div
                          key={index}
                          className="p-2 hover:bg-bg-soft cursor-pointer border-b border-border-color last:border-0"
                          onClick={() => handleSelect(item)}
                        >
                          <div className="text-sm font-semibold truncate">{item.name}</div>
                          {item.full && <div className="text-[10px] text-muted truncate">{item.full}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted/60 mt-0.5">({tripDetails.toCoords.lat.toFixed(4)}, {tripDetails.toCoords.lon.toFixed(4)})</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3 pl-8 border-l border-border-color">
              <div className="text-muted mt-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </div>
              <div>
                <div className="text-xs text-muted mb-0.5">Distance</div>
                <div className="font-bold text-green-brand text-lg">{tripDetails.distance}</div>
                <div className="text-xs text-muted mt-0.5">{tripDetails.time}</div>
              </div>
            </div>
          </div>
          
          <div className="w-[320px] p-2 bg-bg-soft">
            <Suspense fallback={<MapFallback />}>
              <LazyMap startPos={tripDetails.fromCoords} endPos={tripDetails.toCoords} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* 3 Column Layout */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* AI Recommendation */}
        <div className="card col-span-5 flex flex-col min-h-[320px] relative overflow-hidden">
          <AnimatePresence mode="wait">
            {status === "idle" && (
              <motion.div 
                key="idle"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 flex flex-col"
              >
                <h3 className="font-bold flex items-center gap-2 mb-4">
                  <Bot size={20} className="text-muted" />
                  AI Recommendation for You
                </h3>
                
                <div className="flex-1 flex items-center gap-6 mb-6">
                  <div className="relative w-32 h-32 flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" stroke="var(--border-color)" strokeWidth="10" fill="none" />
                      <circle cx="50" cy="50" r="45" stroke="var(--accent)" strokeWidth="10" fill="none" strokeDasharray="283" strokeDashoffset={283 - (283 * (recommendation?.impact_percent || 0) / 100)} strokeLinecap="round" className="transition-all duration-1000" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="icon-glow">
                        <Navigation size={32} />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="inline-block px-2 py-0.5 bg-green-brand/20 text-green-500 text-[10px] font-bold rounded mb-1 border border-green-500/20">Recommended Action</div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-3xl font-bold capitalize">{recommendation?.recommended_action || recommendation?.top_action || "Waiting"}</span>
                      <span className="text-xs bg-accent-soft text-accent px-2 py-0.5 rounded-full border border-accent/20">Best Choice</span>
                    </div>
                    
                    <div className="text-xs text-muted mb-1">Estimated emission saving</div>
                    <div className="text-2xl font-bold text-green-brand leading-none mb-1">{recommendation?.impact_percent ? `${recommendation.impact_percent.toFixed(0)}%` : "0%"}</div>
                    <div className="text-xs text-muted mb-4">compared to cab</div>
                    
                    <div className="flex items-center gap-2">
                      <Check size={14} className="text-green-brand" />
                      <span className="text-xs font-medium">Confidence: {recommendation?.confidence ? `${(recommendation.confidence * 100).toFixed(0)}%` : "0%"}</span>
                      <div className="w-24 h-1.5 bg-bg-soft rounded-full overflow-hidden flex-1">
                        <div className="h-full bg-green-brand rounded-full transition-all duration-1000" style={{width: `${(recommendation?.confidence || 0) * 100}%`}}></div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 mt-auto">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 btn-primary" 
                    onClick={onAccept}
                  >
                    <Check size={18} />
                    Accept Challenge
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 btn-outline" 
                    onClick={onDismiss}
                  >
                    <X size={18} />
                    Not Now
                  </motion.button>
                </div>
              </motion.div>
            )}

            {status === "loading" && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg-card/80 backdrop-blur-sm z-10"
              >
                <Loader2 className="animate-spin text-green-brand" size={40} />
                <p className="font-bold text-lg">Updating your impact...</p>
              </motion.div>
            )}

            {status === "accepted" && (
              <motion.div 
                key="accepted"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-green-brand/5"
              >
                <div className="w-20 h-20 rounded-full bg-green-brand flex items-center justify-center mb-4 shadow-lg shadow-green-500/40">
                  <Trophy size={40} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Challenge Accepted!</h3>
                <p className="text-muted mb-6">Way to go, {user.name}! You've just earned points and helped the planet. 🌍</p>
                <div className="flex items-center gap-4">
                  <div className="px-4 py-2 bg-bg-card rounded-2xl border border-green-brand/30 flex items-center gap-2">
                    <Sparkles size={16} className="text-orange-brand" />
                    <span className="font-bold text-green-brand">+25 Points</span>
                  </div>
                </div>
                <button 
                  className="mt-8 text-sm font-bold text-muted hover:text-main transition-colors"
                  onClick={() => setStatus("idle")}
                >
                  Return to Dashboard
                </button>
              </motion.div>
            )}

            {status === "dismissed" && (
              <motion.div 
                key="dismissed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gray-500/5"
              >
                <div className="w-16 h-16 rounded-full bg-bg-soft flex items-center justify-center mb-4">
                  <Leaf size={32} className="text-muted" />
                </div>
                <h3 className="text-xl font-bold mb-2">No worries!</h3>
                <p className="text-muted text-sm">We'll suggest something else for your next trip.</p>
                <button 
                  className="mt-6 text-sm font-bold text-green-brand hover:underline"
                  onClick={() => setStatus("idle")}
                >
                  Show recommendation again
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Why this recommendation? */}
        <div className="col-span-7 flex flex-col gap-6">
          <div className="card h-full flex flex-col">
            <h3 className="font-bold flex items-center gap-2 mb-4">
              <span className="text-yellow-500 text-lg">💡</span>
              Why this recommendation?
            </h3>
            
            <div className="space-y-4">
              <div className="reason-card flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full ${environment.aqi > 100 ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'} flex items-center justify-center flex-shrink-0`}>
                  <CloudSun size={20} />
                </div>
                <div>
                  <div className={`font-bold text-sm ${environment.aqi > 100 ? 'text-red-500' : 'text-blue-500'} mb-0.5`}>
                    {environment.aqi > 100 ? `High AQI (${environment.aqi})` : `Good AQI (${environment.aqi})`}
                  </div>
                  <div className="text-xs">
                    {environment.aqi > 100 ? `${recommendation?.recommended_action ? recommendation.recommended_action.charAt(0).toUpperCase() + recommendation.recommended_action.slice(1) : "This choice"} helps you avoid more pollution exposure.` : `Great weather to be outdoors!`}
                  </div>
                </div>
              </div>
              
              <div className="reason-card flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center flex-shrink-0">
                  <MapPin size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-blue-500 mb-0.5">Distance: {tripDetails.distance !== "-" ? tripDetails.distance : "6.5 km"}</div>
                  <div className="text-xs capitalize">
                    {recommendation?.recommended_action || "This"} is efficient and time-saving for this distance.
                  </div>
                </div>
              </div>
              
              <div className="reason-card flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center flex-shrink-0">
                  <Leaf size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-green-500 mb-0.5">Lower Emissions</div>
                  <div className="text-xs capitalize">
                    {recommendation?.recommended_action || "This choice"} produces significantly lower emissions compared to other options.
                  </div>
                </div>
              </div>
            </div>
            
            <div 
              className="mt-4 text-xs font-medium text-green-brand hover:underline cursor-pointer flex items-center gap-1 w-fit"
              onClick={() => setShowInfo(true)}
            >
              Learn more about how we decide <ArrowRight size={14} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-12 gap-6">
        {/* Other Green Options */}
        <div className="card col-span-7 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">Other Green Options</h3>
            <div 
              className="text-xs font-medium text-green-brand hover:underline cursor-pointer flex items-center gap-1"
              onClick={() => setShowCompare(true)}
            >
              Compare all <ArrowRight size={14} />
            </div>
          </div>
          
          <div className="grid grid-cols-5 gap-3 flex-1">
            {['walk', 'bike', 'bus', 'metro', 'cab'].map(mode => {
              const alt = recommendation?.alternatives?.find(a => a.action === mode);
              const isRecommended = mode === (recommendation?.recommended_action || recommendation?.top_action);
              const time = alt ? `~ ${alt.time_min.toFixed(0)} mins` : '-';
              const emissions = alt ? `${alt.emissions.toFixed(3)} kg CO₂e` : '-';
              
              const icons = {
                walk: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83m13.79-4l-5.74 9.94"/></svg>,
                bike: <Bike size={18} />,
                metro: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="16" rx="2" ry="2"></rect><path d="M4 11h16"></path><path d="M12 3v8"></path><path d="M8 19l-2 3"></path><path d="M18 22l-2-3"></path><path d="M8 15h0"></path><path d="M16 15h0"></path></svg>,
                cab: <Car size={18} />
              };

              return (
                <div 
                  key={mode} 
                  className={`option-card ${isRecommended ? 'active' : ''}`}
                >
                  {isRecommended && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm animate-pulse"></div>}
                  <div className={`icon-bg w-8 h-8 rounded-full flex items-center justify-center mb-2 ${isRecommended ? 'bg-green-brand text-white' : 'bg-bg-soft text-muted'}`}>
                    {icons[mode]}
                  </div>
                  <div className="font-bold text-sm capitalize">{mode}</div>
                  <div className="text-[10px] mb-0.5">{time}</div>
                  <div className="text-[10px] font-medium mb-3">{emissions}</div>
                  
                  <div className={`mt-auto w-full text-[10px] px-2 py-1 rounded-md font-medium flex items-center justify-center gap-1 ${
                    isRecommended ? 'bg-green-brand/20 text-green-500' : 
                    mode === 'cab' ? 'bg-red-500/10 text-red-500' : 'bg-bg-soft text-muted'
                  }`}>
                    {isRecommended ? <><span className="text-green-500">★</span> Recommended</> : 
                     mode === 'cab' ? 'Highest emissions' : 'Good choice'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Your Impact Growth */}
        <div className="card col-span-5 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">Impact Growth</h3>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-brand shadow-[0_0_8px_var(--accent-glow)]"></span>
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">7 Day Trend</span>
            </div>
          </div>
          
          <div className="flex-1 min-h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={impactHistory}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
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
                  dy={10}
                />
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} cursor={{stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 4'}} />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="var(--accent)" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                  animationDuration={1500}
                  dot={{ r: 0 }}
                  activeDot={{ r: 6, fill: 'var(--accent)', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-4 border-t border-border-color flex justify-between items-center">
            <div>
              <div className="text-[10px] text-muted uppercase font-bold tracking-widest">Weekly Total</div>
              <div className="text-xl font-bold text-green-brand leading-none mt-1">42.4 kg <span className="text-xs font-normal text-muted">CO₂e Saved</span></div>
            </div>
            <div className="bg-green-brand/10 px-3 py-1.5 rounded-xl border border-green-brand/20">
              <span className="text-[10px] font-bold text-green-brand">+12% vs last week</span>
            </div>
          </div>
        </div>
      </div>

      {showCompare && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-[500px] shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-gray-900">Compare Transport Options</h2>
            <div className="flex flex-col gap-3 mb-6">
              {['walk', 'bike', 'metro', 'cab'].map(mode => {
                const alt = recommendation?.alternatives?.find(a => a.action === mode);
                const time = alt ? `~ ${alt.time_min} mins` : '-';
                const emissions = alt ? `${alt.emissions} kg CO₂e` : '-';
                return (
                  <div key={mode} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <span className="font-bold capitalize text-gray-800">{mode}</span>
                    <span className="text-sm font-medium text-gray-600">{time}</span>
                    <span className="text-sm font-medium text-gray-600">{emissions}</span>
                  </div>
                );
              })}
            </div>
            <button className="w-full btn-primary py-3" onClick={() => setShowCompare(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-[500px] shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-gray-900 flex items-center gap-2">
              <span className="text-yellow-500">💡</span> How we decide
            </h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Our AI Recommendation Engine considers multiple real-time factors to suggest the optimal eco-friendly transport mode for your specific trip:
            </p>
            <ul className="flex flex-col gap-3 mb-6">
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5"><MapPin size={12}/></div>
                <div><strong>Distance:</strong> Shorter trips favor walking/biking, while longer ones favor metro/cabs.</div>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0 mt-0.5"><CloudSun size={12}/></div>
                <div><strong>Air Quality Index (AQI):</strong> We avoid recommending outdoor exposure (like biking) when pollution is hazardous.</div>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 mt-0.5"><Leaf size={12}/></div>
                <div><strong>Estimated Emissions:</strong> The model dynamically minimizes CO₂ output.</div>
              </li>
            </ul>
            <button className="w-full btn-primary py-3" onClick={() => setShowInfo(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
