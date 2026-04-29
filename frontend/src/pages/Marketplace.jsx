import React, { useState, useEffect } from "react";
import { ShoppingBag, Trophy, Tag, Filter, Check, Star } from "lucide-react";
import { api } from "../services/api.js";

const USER_ID = 1;

export const Marketplace = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");

  useEffect(() => {
    api.user(USER_ID).then(setUser).finally(() => setLoading(false));
  }, []);

  const products = [
    { id: 1, name: "Reusable Coffee Cup", category: "Daily Essentials", cost: 450, rating: 4.8, img: "☕", stock: 12 },
    { id: 2, name: "Bamboo Toothbrush Kit", category: "Personal Care", cost: 200, rating: 4.5, img: "🪥", stock: 45 },
    { id: 3, name: "Solar Phone Charger", category: "Tech", cost: 1200, rating: 4.9, img: "☀️", stock: 5 },
    { id: 4, name: "Organic Tote Bag", category: "Fashion", cost: 300, rating: 4.6, img: "👜", stock: 22 },
    { id: 5, name: "Water Filter Pitcher", category: "Daily Essentials", cost: 850, rating: 4.7, img: "💧", stock: 8 },
    { id: 6, name: "Eco-Friendly Sneakers", category: "Fashion", cost: 2500, rating: 4.9, img: "👟", stock: 3 },
  ];

  const categories = ["All", "Daily Essentials", "Personal Care", "Tech", "Fashion"];
  
  const filteredProducts = selectedCategory === "All" 
    ? products 
    : products.filter(p => p.category === selectedCategory);

  const handleRedeem = async (product) => {
    if ((user?.green_points || 0) < product.cost) {
      alert("Insufficient points!");
      return;
    }
    try {
      await api.redeem({
        user_id: USER_ID,
        reward_name: product.name,
        points: product.cost
      });
      alert(`Success! Redeemed ${product.name}`);
      api.user(USER_ID).then(setUser);
    } catch (err) {
      alert("Redemption failed: " + err.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Marketplace</h2>
          <p className="text-gray-500">Redeem your hard-earned points for eco-friendly rewards</p>
        </div>
        <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-gray-100 shadow-sm">
          <Trophy size={18} className="text-green-brand" />
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase">Your Balance</div>
            <div className="text-lg font-black text-gray-900">{user?.green_points || 2795} pts</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button 
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${selectedCategory === cat ? 'bg-green-brand text-white shadow-md' : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {filteredProducts.map(product => (
          <div key={product.id} className="card group hover:border-green-200 transition-all hover:shadow-xl flex flex-col p-0 overflow-hidden">
            <div className="bg-gray-50 h-40 flex items-center justify-center text-6xl group-hover:scale-110 transition-transform duration-500">
              {product.img}
            </div>
            <div className="p-5 flex flex-col flex-1">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded uppercase">{product.category}</span>
                <div className="flex items-center gap-1 text-xs font-bold text-yellow-500">
                  <Star size={12} fill="currentColor" />
                  {product.rating}
                </div>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">{product.name}</h4>
              <div className="text-xs text-gray-400 mb-4">{product.stock} left in stock</div>
              
              <div className="mt-auto flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Cost</div>
                  <div className="text-xl font-black text-gray-900">{product.cost} <span className="text-xs text-gray-400 font-bold">pts</span></div>
                </div>
                <button 
                  onClick={() => handleRedeem(product)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${user?.green_points >= product.cost ? 'bg-green-brand text-white hover:bg-green-700 shadow-md active:scale-95' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  <Tag size={14} />
                  Redeem
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card bg-blue-50 border-blue-100 flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
            <Check size={24} />
          </div>
          <div>
            <h4 className="font-bold text-blue-900">Free Shipping on your first order!</h4>
            <p className="text-sm text-blue-700">Use code <span className="font-bold">ECOFIRST</span> at checkout.</p>
          </div>
        </div>
        <ShoppingBag className="text-blue-200" size={48} />
      </div>
    </div>
  );
};
