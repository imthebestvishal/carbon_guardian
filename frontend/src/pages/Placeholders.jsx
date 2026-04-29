import React from "react";
import { Leaf, Bot, TrendingDown, Trophy, Users, ShoppingBag, FlaskConical, Settings } from "lucide-react";

const Placeholder = ({ title, icon: Icon }) => (
  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
    <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center">
      <Icon size={40} />
    </div>
    <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
    <p className="text-sm">This module is coming soon to Carbon Guardian AI.</p>
  </div>
);

export const Footprint = () => <Placeholder title="My Footprint" icon={Leaf} />;
export const AIRecommender = () => <Placeholder title="AI Recommender" icon={Bot} />;
export const LiveImpact = () => <Placeholder title="Live Impact" icon={TrendingDown} />;
export const GreenPoints = () => <Placeholder title="Green Points" icon={Trophy} />;
export const Community = () => <Placeholder title="Community" icon={Users} />;
export const Marketplace = () => <Placeholder title="Marketplace" icon={ShoppingBag} />;
export const Simulation = () => <Placeholder title="Simulation Lab" icon={FlaskConical} />;
export const SettingsPage = () => <Placeholder title="Settings" icon={Settings} />;
