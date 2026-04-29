import React, { useState, useEffect, useCallback, Suspense } from "react";
import { Bot, MapPin, Navigation, Info, ArrowRight, Loader2, Zap, Leaf, Check, X, Bike, Car } from "lucide-react";
import { api } from "../services/api.js";
import { getDistance, estimateDuration } from "../services/geo.js";

const USER_ID = 1;

const LazyMap = React.lazy(() =>
  import("../components/Map.jsx").then((mod) => ({ default: mod.Map }))
);

const MapFallback = () => (
  <div className="w-full h-full min-h-[300px] bg-gray-100 rounded-2xl flex items-center justify-center">
    <Loader2 className="animate-spin text-gray-300" size={32} />
  </div>
);

export const AIRecommender = () => {
  const [loading, setLoading] = useState(false);
  const [destInput, setDestInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [tripDetails, setTripDetails] = useState({
    from: "Najafgarh, Delhi",
    fromCoords: { lat: 28.6189, lon: 77.0103 },
    to: "",
    toCoords: { lat: 28.6880, lon: 77.2100 },
    distance: "-",
    time: "-",
  });

  const [accepted, setAccepted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  const handleAccept = async () => {
    if (!recommendation) return;
    setLoadingAction(true);
    try {
      const mode = recommendation.recommended_action || recommendation.top_action;
      const dist = parseFloat(tripDetails.distance) || 6.0; // Use default if parsing fails
      
      await api.trackAction({
        user_id: USER_ID,
        action: mode,
        accepted: true,
        recommendation_id: recommendation.recommendation_id || null,
        recommended_action: mode,
        distance_km: dist
      });
      
      setAccepted(true);
      alert(`Challenge accepted! You've chosen to ${mode} for this trip. +50 Green Points awarded!`);
    } catch (err) {
      console.error("Failed to accept recommendation", err);
      alert(`Error saving action: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDismiss = async () => {
    if (!recommendation) return;
    try {
      const mode = recommendation.recommended_action || recommendation.top_action;
      await api.trackAction({
        user_id: USER_ID,
        action: mode,
        accepted: false,
        recommendation_id: recommendation.recommendation_id || null,
        recommended_action: mode,
        distance_km: parseFloat(tripDetails.distance) || 6.0
      });
      setDismissed(true);
    } catch (err) {
      console.error("Failed to dismiss recommendation", err);
    }
  };

  const handleSelect = useCallback(async (item) => {
    setDestInput(item.name);
    setSuggestions([]);
    setAccepted(false);
    setDismissed(false);
    
    const distKm = getDistance(
      tripDetails.fromCoords.lat,
      tripDetails.fromCoords.lon,
      item.lat,
      item.lon
    );
    const estTime = estimateDuration(distKm, "cab");

    setTripDetails(prev => ({
      ...prev,
      to: item.name,
      toCoords: { lat: item.lat, lon: item.lon },
      distance: `${distKm.toFixed(1)} km`,
      time: `~ ${Math.round(estTime)} mins`
    }));

    setLoading(true);
    try {
      const data = await api.aiRecommend({
        user_id: USER_ID,
        distance_km: distKm,
        duration_min: estTime,
        aqi: 100, // Fallback
        current_action: "cab"
      });
      setRecommendation(data);
    } catch (err) {
      console.error("Recommendation failed", err);
    } finally {
      setLoading(false);
    }
  }, [tripDetails.fromCoords]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setDestInput(val);
    if (val.length > 2) {
      fetch(`https://photon.komoot.io/api?q=${encodeURIComponent(val)}&limit=5`)
        .then(r => r.json())
        .then(data => {
          setSuggestions(data.features.map(f => ({
            name: f.properties.name || f.properties.street || "Unknown",
            full: [f.properties.name, f.properties.city, f.properties.country].filter(Boolean).join(", "),
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0]
          })));
        });
    } else {
      setSuggestions([]);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">AI Recommender</h2>
        <p className="text-gray-500">Intelligent pathfinding for a greener journey</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Search Panel */}
        <div className="card col-span-4 flex flex-col gap-6">
          <div className="space-y-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Navigation size={18} className="text-blue-500" />
              Plan Your Trip
            </h3>
            
            <div className="space-y-6 relative">
              <div className="relative">
                <label className="text-[10px] font-bold text-gray-400 uppercase absolute -top-2 left-3 bg-white px-1 z-10">Source</label>
                <div className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MapPin size={14} className="text-green-500" />
                  {tripDetails.from}
                </div>
              </div>

              <div className="relative">
                <label className="text-[10px] font-bold text-gray-400 uppercase absolute -top-2 left-3 bg-white px-1 z-10">Destination</label>
                <div className="relative">
                  <input 
                    type="text"
                    placeholder="Where are you going?"
                    className="w-full p-3 bg-white border border-gray-100 rounded-xl text-sm font-bold text-gray-900 outline-none focus:border-blue-300 transition-colors shadow-sm"
                    value={destInput}
                    onChange={handleInputChange}
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 bg-white shadow-xl border border-gray-100 rounded-xl w-full z-50 overflow-hidden max-h-48">
                      {suggestions.map((item, index) => (
                        <div
                          key={index}
                          className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                          onClick={() => handleSelect(item)}
                        >
                          <div className="text-sm font-bold text-gray-800">{item.name}</div>
                          <div className="text-[10px] text-gray-500 truncate">{item.full}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {recommendation && (
            <div className="mt-auto space-y-4 pt-6 border-t border-gray-50">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Calculated Distance</span>
                <span className="font-bold text-gray-900">{tripDetails.distance}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Estimated Duration</span>
                <span className="font-bold text-gray-900">{tripDetails.time}</span>
              </div>
            </div>
          )}
        </div>

        {/* Map View */}
        <div className="col-span-8">
          <div className="card p-2 h-[450px] overflow-hidden">
            <Suspense fallback={<MapFallback />}>
              <LazyMap startPos={tripDetails.fromCoords} endPos={tripDetails.toCoords} />
            </Suspense>
          </div>
        </div>

        {/* AI Insight Section */}
        {recommendation ? (
          dismissed ? null : (
            <>
              {accepted ? (
                <div className="card col-span-12 bg-green-50 border-green-200 flex items-center justify-center py-10 gap-4 animate-in fade-in zoom-in duration-300 mb-6">
                  <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center">
                    <Check size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-green-900">Action accepted!</h3>
                    <p className="text-green-700 text-sm">Challenge accepted! Green Points have been added to your profile.</p>
                  </div>
                </div>
              ) : (
                <div className="card col-span-12 grid grid-cols-3 gap-8 mb-6">
                  <div className="col-span-1 flex flex-col justify-center border-r border-gray-100 pr-8">
                    <div className="flex items-center gap-2 text-green-600 font-bold mb-2">
                      <Bot size={20} />
                      AI TOP CHOICE
                    </div>
                    <h4 className="text-4xl font-black text-gray-900 capitalize mb-1">{recommendation.recommended_action || recommendation.top_action}</h4>
                    <p className="text-sm text-gray-500">Recommended based on current AQI and trip distance.</p>
                    
                    <div className="mt-6 flex gap-2">
                      <button 
                        onClick={handleAccept}
                        disabled={loadingAction}
                        className="flex-1 btn-primary py-3"
                      >
                        {loadingAction ? <Loader2 size={18} className="animate-spin" /> : "Accept"}
                      </button>
                      <button 
                        onClick={handleDismiss}
                        className="flex-1 btn-outline py-3"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-6">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col justify-between">
                      <div>
                        <div className="text-xs font-bold text-gray-400 mb-1">EMISSION SAVING</div>
                        <div className="text-2xl font-black text-green-brand">{recommendation.impact_percent ? `${recommendation.impact_percent.toFixed(0)}%` : "0%"}</div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <Leaf size={10} className="text-green-500" />
                        compared to typical cab ride
                      </div>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col justify-between">
                      <div>
                        <div className="text-xs font-bold text-gray-400 mb-1">AI CONFIDENCE</div>
                        <div className="text-2xl font-black text-blue-500">{recommendation.confidence ? `${(recommendation.confidence * 100).toFixed(0)}%` : "0%"}</div>
                      </div>
                      <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{width: `${(recommendation.confidence || 0) * 100}%`}}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Green Options cards */}
              <div className="card col-span-12">
                <h3 className="font-bold text-gray-900 mb-6">Other Green Options</h3>
                <div className="grid grid-cols-5 gap-4">
                  {['walk', 'bike', 'bus', 'metro', 'cab'].map(mode => {
                    const alt = recommendation?.alternatives?.find(a => a.action === mode);
                    const isRecommended = mode === (recommendation?.recommended_action || recommendation?.top_action);
                    const time = alt ? `~ ${alt.time_min.toFixed(0)} mins` : '-';
                    const emissions = alt ? `${alt.emissions.toFixed(3)} kg CO₂e` : '-';
                    
                    const icons = {
                      walk: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83m13.79-4l-5.74 9.94"/></svg>,
                      bike: <Bike size={18} />,
                      bus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 17h2v2h-2zM3 17h2v2H3zM21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10m18 0h-2v2h-12v-2H3m18 0v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2"/></svg>,
                      metro: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="16" rx="2" ry="2"></rect><path d="M4 11h16"></path><path d="M12 3v8"></path><path d="M8 19l-2 3"></path><path d="M18 22l-2-3"></path><path d="M8 15h0"></path><path d="M16 15h0"></path></svg>,
                      cab: <Car size={18} />
                    };

                    return (
                      <div 
                        key={mode} 
                        className={`card p-4 flex flex-col items-center text-center relative ${isRecommended ? 'card-highlight' : 'border-transparent hover:border-gray-200'}`}
                      >
                        {isRecommended && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm animate-pulse"></div>}
                        <div className={`icon-bg w-10 h-10 rounded-full flex items-center justify-center mb-3 ${isRecommended ? 'bg-green-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {icons[mode]}
                        </div>
                        <div className="font-bold text-sm text-gray-900 capitalize">{mode}</div>
                        <div className="text-[10px] text-gray-500 mb-1">{time}</div>
                        <div className="text-[10px] font-medium text-gray-700 mb-4">{emissions}</div>
                        
                        <div className={`mt-auto w-full text-[10px] px-2 py-1.5 rounded-md font-medium flex items-center justify-center gap-1 ${
                          isRecommended ? 'bg-green-brand/10 text-green-700' : 
                          mode === 'cab' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'
                        }`}>
                          {isRecommended ? <><span className="text-green-500">★</span> Recommended</> : 
                           mode === 'cab' ? 'Highest emissions' : 'Available'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )
        ) : (
          <div className="card col-span-12 flex items-center justify-center py-12 text-gray-400 gap-4">
            <Info size={24} />
            <p className="font-medium">Search for a destination to receive AI-powered transport recommendations.</p>
          </div>
        )}
      </div>
    </div>
  );
};
