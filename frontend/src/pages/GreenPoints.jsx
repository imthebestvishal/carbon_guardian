import React, { useState, useEffect } from "react";
import { Trophy, Gift, Star, Award, Zap, TrendingUp, ChevronRight, Check, ArrowRight } from "lucide-react";
import { api } from "../services/api.js";

const USER_ID = 1;

export const GreenPoints = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.user(USER_ID).then(setUser).finally(() => setLoading(false));
  }, []);

  const badges = [
    { name: "Eco Warrior", icon: Trophy, color: "text-yellow-500", bg: "bg-yellow-50", earned: true },
    { name: "Zero Waste", icon: Star, color: "text-blue-500", bg: "bg-blue-50", earned: true },
    { name: "Green Commuter", icon: Zap, color: "text-green-500", bg: "bg-green-50", earned: true },
    { name: "Carbon Neutral", icon: Award, color: "text-purple-500", bg: "bg-purple-50", earned: false },
  ];

  const rewards = [
    { name: "Tree Plantation", cost: 500, desc: "We plant a tree in your name", icon: "🌳" },
    { name: "Amazon Voucher", cost: 1000, desc: "$10 Sustainable store voucher", icon: "🎫" },
    { name: "Eco-Friendly Kit", cost: 2500, desc: "Zero-waste travel essentials", icon: "📦" },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Green Points</h2>
          <p className="text-gray-500">Earn rewards by making sustainable choices</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-white border border-gray-100 rounded-2xl px-6 py-3 shadow-sm flex flex-col items-end">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Available Balance</div>
            <div className="text-2xl font-black text-green-brand flex items-center gap-2">
              <Trophy size={20} />
              {user?.green_points || 2795}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Level & Streak */}
        <div className="card col-span-12 flex items-center justify-between p-8 bg-gradient-to-r from-green-50 to-blue-50 border-none">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-3xl bg-white shadow-md flex items-center justify-center text-3xl">
              🏅
            </div>
            <div>
              <div className="text-sm font-bold text-green-700 uppercase mb-1">Current Level</div>
              <h3 className="text-3xl font-black text-gray-900">Elite Guardian</h3>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-48 h-2 bg-white/50 rounded-full overflow-hidden border border-white">
                  <div className="h-full bg-green-brand w-[75%]"></div>
                </div>
                <span className="text-xs font-bold text-gray-500">750/1000 to next level</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-4xl font-black text-orange-500 mb-1">{user?.streak_days || 2}</div>
              <div className="text-[10px] font-bold text-gray-500 uppercase">Day Streak</div>
            </div>
            <div className="w-px h-12 bg-gray-200"></div>
            <div className="text-center">
              <div className="text-4xl font-black text-blue-500 mb-1">12</div>
              <div className="text-[10px] font-bold text-gray-500 uppercase">Challenges</div>
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="card col-span-8">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Award size={18} className="text-yellow-500" />
            Your Badges
          </h3>
          <div className="grid grid-cols-4 gap-4">
            {badges.map((badge, idx) => {
              const Icon = badge.icon;
              return (
                <div key={idx} className={`p-6 rounded-3xl flex flex-col items-center text-center gap-3 transition-all ${badge.earned ? `${badge.bg} ${badge.color}` : 'bg-gray-50 text-gray-300'}`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-sm`}>
                    <Icon size={24} />
                  </div>
                  <div className="text-xs font-bold">{badge.name}</div>
                  {!badge.earned && <div className="text-[8px] font-bold opacity-50">Locked</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Redeem Quick View */}
        <div className="card col-span-4">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Gift size={18} className="text-purple-500" />
            Quick Redeem
          </h3>
          <div className="space-y-3">
            {rewards.map((reward, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between hover:bg-gray-100 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{reward.icon}</span>
                  <div>
                    <div className="text-xs font-bold text-gray-900">{reward.name}</div>
                    <div className="text-[10px] text-gray-500">{reward.cost} pts</div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all" />
              </div>
            ))}
          </div>
          <button className="w-full mt-6 text-sm font-bold text-green-brand flex items-center justify-center gap-1 hover:underline">
            View Marketplace <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
