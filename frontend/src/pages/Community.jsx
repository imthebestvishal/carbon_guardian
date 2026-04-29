import React, { useState, useEffect } from "react";
import { 
  Users, 
  Trophy, 
  Medal, 
  Star, 
  TrendingUp, 
  Search, 
  Loader2, 
  AlertCircle,
  TrendingDown
} from "lucide-react";
import { api } from "../services/api.js";
import { motion, AnimatePresence } from "framer-motion";

const USER_ID = 1;

export const Community = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async () => {
    try {
      const [lbData, statsData] = await Promise.all([
        api.leaderboard(),
        api.communityStats()
      ]);
      setLeaderboard(lbData || []);
      setStats(statsData);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch community data:", err);
      setError("Unable to load community data. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredLeaderboard = leaderboard.filter(user => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="animate-spin text-green-brand" size={40} />
        <p className="text-muted font-bold">Synchronizing community data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="text-muted max-w-xs">{error}</p>
        <button 
          onClick={() => { setLoading(true); fetchData(); }}
          className="btn-primary mt-4"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-700">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Community</h2>
          <p className="text-muted">Join the movement and see how others are making a difference</p>
        </div>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input 
            type="text" 
            placeholder="Search users..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 bg-bg-card border border-border-color rounded-full text-sm outline-none focus:border-accent transition-colors shadow-sm w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        
        {/* Top 3 Podiums */}
        {!searchQuery && leaderboard.length >= 3 && (
          <div className="col-span-12 grid grid-cols-3 gap-6 items-end mb-4 h-[240px]">
            {[1, 0, 2].map((posIdx, displayIdx) => {
              const item = leaderboard[posIdx];
              if (!item) return null;
              
              const heights = [160, 200, 140];
              const colors = ["bg-bg-soft", "bg-accent-soft", "bg-orange-500/10"];
              const borderColors = ["border-border-color", "border-accent/30", "border-orange-500/30"];
              const icons = [Medal, Trophy, Star];
              const iconColors = ["text-muted", "text-accent", "text-orange-500"];
              
              const Icon = icons[posIdx];

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: displayIdx * 0.1 }}
                  key={item.rank} 
                  className="flex flex-col items-center gap-3"
                >
                  <div className="relative">
                    <div className={`w-16 h-16 rounded-full border-4 border-bg-card shadow-lg flex items-center justify-center font-black text-xl overflow-hidden ${colors[posIdx]}`}>
                      {item.name.charAt(0)}
                    </div>
                    <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full ${colors[posIdx]} ${iconColors[posIdx]} flex items-center justify-center shadow-md border-2 border-bg-card`}>
                      <Icon size={16} />
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold">{item.name}</div>
                    <div className={`text-xs font-bold ${iconColors[posIdx]}`}>{item.points} pts</div>
                  </div>
                  <div className={`w-full rounded-t-3xl ${colors[posIdx]} border-t border-x ${borderColors[posIdx]} transition-all duration-1000`} style={{height: `${heights[posIdx]}px`}}></div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Global Leaderboard */}
        <div className="card col-span-8 flex flex-col">
          <h3 className="font-bold mb-6 flex items-center gap-2">
            <Trophy size={18} className="text-yellow-500" />
            Global Rankings
          </h3>
          
          <div className="flex-1 space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredLeaderboard.length > 0 ? (
                filteredLeaderboard.map((item) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={item.rank} 
                    className="flex items-center gap-4 p-4 rounded-2xl hover:bg-bg-soft transition-colors border border-transparent hover:border-border-color"
                  >
                    <div className="w-8 text-center font-black text-muted text-sm">#{item.rank}</div>
                    <div className="w-10 h-10 rounded-full bg-bg-soft flex items-center justify-center font-bold text-muted">
                      {item.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold flex items-center gap-2">
                        {item.name} 
                        {item.rank <= 3 && <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded uppercase font-black tracking-tighter">Pro</span>}
                      </div>
                      <div className="text-[10px] text-muted font-bold uppercase tracking-widest">
                        {item.preferred_transport || "Guardian"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-lg leading-tight">{item.points}</div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-tighter">Green Points</div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-muted">
                  <Search size={40} className="mb-4 opacity-20" />
                  <p className="font-bold">No users found matching "{searchQuery}"</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Community Stats */}
        <div className="col-span-4 flex flex-col gap-6">
          <div className="card bg-green-dark text-white p-6 border-none shadow-[0_20px_50px_rgba(34,197,94,0.2)]">
            <h3 className="font-bold text-accent mb-6 flex items-center gap-2">
              <TrendingUp size={18} />
              Platform Impact
            </h3>
            <div className="space-y-6">
              <div className="relative">
                <div className="text-4xl font-black mb-1 flex items-baseline gap-1">
                  +{stats?.trees_today || 0}
                  <span className="text-xs font-normal text-green-300/60 uppercase tracking-widest ml-2">Today</span>
                </div>
                <div className="text-xs text-green-300 font-medium">New trees pledged by community</div>
              </div>
              
              <div className="relative">
                <div className="flex justify-between items-end mb-2">
                  <div className="text-3xl font-black">{stats?.target_percent || 0}%</div>
                  <div className="text-[10px] font-bold text-green-300 uppercase">Weekly Target</div>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats?.target_percent || 0}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-accent shadow-[0_0_10px_var(--accent-glow)]"
                  ></motion.div>
                </div>
                <div className="mt-2 text-[10px] text-green-300/60 flex justify-between">
                  <span>Progress achieved</span>
                  <span>10.0k pts goal</span>
                </div>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex -space-x-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-6 h-6 rounded-full border-2 border-green-dark bg-bg-soft flex items-center justify-center text-[8px] font-bold">U{i}</div>
                  ))}
                </div>
                <div className="text-[10px] font-bold text-accent uppercase tracking-widest">
                  {stats?.active_now || 0} Users Active Now
                </div>
              </div>
              <p className="text-xs text-green-100 leading-relaxed italic opacity-70">
                "Small acts, when multiplied by millions of people, can transform the world."
              </p>
            </div>
          </div>

          <div className="card flex-1 flex flex-col">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <Medal size={18} className="text-accent" />
              Community Achievements
            </h3>
            <div className="space-y-3 flex-1">
              {[
                { name: "100km Clean Commute", count: "1.2k users", icon: "🚲", color: "bg-accent-soft text-accent" },
                { name: "Zero Waste Week", count: "850 users", icon: "♻️", color: "bg-blue-500/10 text-blue-500" },
                { name: "Eco Influencer", count: "120 users", icon: "📣", color: "bg-orange-500/10 text-orange-500" }
              ].map((ach, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-bg-soft rounded-2xl border border-border-color hover:border-accent/30 transition-colors cursor-default group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${ach.color} group-hover:scale-110 transition-transform`}>
                    {ach.icon}
                  </div>
                  <div>
                    <div className="text-xs font-bold">{ach.name}</div>
                    <div className="text-[10px] text-muted font-medium">{ach.count}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 bg-accent-soft rounded-2xl text-[10px] text-accent font-bold text-center border border-accent/10">
              View All 15 Platform Achievements →
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
