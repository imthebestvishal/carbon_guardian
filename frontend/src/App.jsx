import {
  Bike,
  Bot,
  CalendarDays,
  Car,
  CloudSun,
  Home,
  Leaf,
  Loader2,
  Settings,
  Thermometer,
  Trophy,
  Users,
  ShoppingBag,
  FlaskConical,
  MapPin,
  Check,
  X,
  Droplets,
  Zap,
  ArrowRight,
  TrendingDown,
  Navigation,
  Moon,
  Sun
} from "lucide-react";
import React, { useEffect, useState, useRef, useCallback, useMemo, Suspense } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "./services/api.js";
import { getDistance, estimateDuration } from "./services/geo.js";

// Page Components (Lazy Loaded for performance)
const Dashboard = React.lazy(() => import("./pages/Dashboard.jsx"));
const Footprint = React.lazy(() => import("./pages/Footprint.jsx").then(m => ({ default: m.Footprint })));
const AIRecommender = React.lazy(() => import("./pages/AIRecommender.jsx").then(m => ({ default: m.AIRecommender })));
const LiveImpact = React.lazy(() => import("./pages/LiveImpact.jsx").then(m => ({ default: m.LiveImpact })));
const GreenPoints = React.lazy(() => import("./pages/GreenPoints.jsx").then(m => ({ default: m.GreenPoints })));
const Community = React.lazy(() => import("./pages/Community.jsx").then(m => ({ default: m.Community })));
const Marketplace = React.lazy(() => import("./pages/Marketplace.jsx").then(m => ({ default: m.Marketplace })));
const Simulation = React.lazy(() => import("./pages/Simulation.jsx").then(m => ({ default: m.Simulation })));
const SettingsPage = React.lazy(() => import("./pages/Settings.jsx").then(m => ({ default: m.SettingsPage })));

const USER_ID = 1;

const PageLoader = () => (
  <div className="flex-1 flex items-center justify-center min-h-[400px]">
    <Loader2 className="animate-spin text-green-brand" size={32} />
  </div>
);

const nav = [
  [Home, "Dashboard", "/", null],
  [Leaf, "My Footprint", "/footprint", null],
  [Bot, "AI Recommender", "/ai", "dot"],
  [TrendingDown, "Live Impact", "/impact", null],
  [Trophy, "Green Points", "/points", null],
  [Users, "Community", "/community", "New"],
  [ShoppingBag, "Marketplace", "/marketplace", null],
  [FlaskConical, "Simulation Lab", "/simulation", null],
  [Settings, "Settings", "/settings", null],
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Theme State
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === "light" ? "dark" : "light");

  const [error, setError] = useState("");
  const [user, setUser] = useState({ name: "Aarav", green_points: 290, streak_days: 1 });
  const [environment, setEnvironment] = useState({
    city: "Delhi",
    area: "Najafgarh",
    aqi: 100,
    aqi_label: "Moderate",
    temperature: 38,
  });
  
  const locationRef = useRef({ lat: 28.6189, lon: 77.0103 });
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);

  const [tripDetails, setTripDetails] = useState({
    from: "Najafgarh, Delhi",
    fromCoords: { lat: 28.6189, lon: 77.0103 },
    to: "",
    toCoords: { lat: 28.6880, lon: 77.2100 },
    distance: "-",
    time: "-",
  });
  const [destInput, setDestInput] = useState("");
  const [debouncedDest, setDebouncedDest] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [tripData, setTripData] = useState(null);
  const controllerRef = useRef(null);
  const searchCache = useRef({});

  const [impactData, setImpactData] = useState({
    emissionsSaved: 12,
    energySaved: 3.6,
    wasteReduced: 1.2
  });

  useEffect(() => {
    const DEFAULT_LAT = 28.6189;
    const DEFAULT_LON = 77.0103;

    async function fetchDashboardData(lat, lon, isRefinement = false) {
      try {
        if (!isRefinement) setLoading(true);
        const [userData, envData, recData] = await Promise.all([
          api.user(USER_ID).catch(() => null),
          api.environment({ lat, lon }).catch(() => null),
          api.aiRecommend({
            user_id: USER_ID,
            distance_km: 6.5,
            duration_min: 28,
            aqi: 100,
            current_action: "cab"
          }).catch(() => null),
        ]);

        if (userData) setUser(prev => ({...prev, ...userData}));
        if (envData) {
          setEnvironment(envData);
          locationRef.current = { lat, lon };
          setTripDetails(prev => ({
            ...prev,
            from: `${envData.area || ""}, ${envData.city || ""}`.replace(/^,\s*/, ""),
            fromCoords: { lat, lon }
          }));

          if (envData.aqi && envData.aqi !== 100) {
            api.aiRecommend({
              user_id: USER_ID,
              distance_km: 6.5,
              duration_min: 28,
              aqi: envData.aqi,
              current_action: "cab"
            }).then(refined => { if (refined) setRecommendation(refined); })
              .catch(() => {});
          }
        }
        if (recData) setRecommendation(recData);
      } catch (e) {
        console.error("Dashboard load failed:", e);
      } finally {
        if (!isRefinement) setLoading(false);
      }
    }

    fetchDashboardData(DEFAULT_LAT, DEFAULT_LON);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const moved = Math.abs(lat - DEFAULT_LAT) > 0.01 || Math.abs(lon - DEFAULT_LON) > 0.01;
          if (moved) {
            fetchDashboardData(lat, lon, true);
          }
        },
        (err) => {
          console.warn("Geolocation unavailable, using default location:", err.message);
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      );
    }
  }, []);

  useEffect(() => {
    const AQI_REFRESH_MS = 300_000;
    const refreshEnvironment = async () => {
      const { lat, lon } = locationRef.current;
      try {
        const { clearApiCache } = await import("./services/api.js");
        clearApiCache();
        const envData = await api.environment({ lat, lon });
        if (envData) {
          setEnvironment(envData);
        }
      } catch (err) {
        console.warn("[AQI Auto-Refresh] Failed:", err.message);
      }
    };
    const interval = setInterval(refreshEnvironment, AQI_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDest(destInput);
    }, 150);
    return () => clearTimeout(timer);
  }, [destInput]);

  useEffect(() => {
    if (debouncedDest.length < 3) {
      setSuggestions([]);
      return;
    }
    if (searchCache.current[debouncedDest]) {
      setSuggestions(searchCache.current[debouncedDest]);
      return;
    }
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    const fetchSuggestions = async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api?q=${encodeURIComponent(debouncedDest)}&limit=5`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        const results = data.features.map((f) => {
          const props = f.properties;
          const name = props.name || props.street || "Unknown";
          const city = props.city || props.county || props.state || "";
          const country = props.country || "";
          const full = [name, city, country].filter(Boolean).join(", ");
          return {
            name: name,
            full: full,
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
          };
        });
        searchCache.current[debouncedDest] = results;
        setSuggestions(results);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Suggestion error:", err);
        }
      }
    };
    fetchSuggestions();
  }, [debouncedDest]);

  const preloadPopularPlaces = useCallback(() => {
    const popular = ["Delhi", "Mumbai", "Airport"];
    popular.forEach((q) => {
      if (!searchCache.current[q]) {
        fetch(`https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=5`)
          .then((r) => r.json())
          .then((data) => {
            searchCache.current[q] = data.features.map((f) => ({
              name: f.properties.name || f.properties.street || "Unknown",
              full: [f.properties.name, f.properties.city, f.properties.country].filter(Boolean).join(", "),
              lat: f.geometry.coordinates[1],
              lon: f.geometry.coordinates[0],
            }));
          })
          .catch(() => {});
      }
    });
  }, []);

  const handleTripSearch = useCallback(async (e) => {
    if (e.key === 'Enter' && destInput.trim() && tripDetails.fromCoords) {
      try {
        setLoading(true);
        const tData = await api.tripCompute({
          source_lat: tripDetails.fromCoords.lat,
          source_lon: tripDetails.fromCoords.lon,
          destination: destInput
        });
        setTripData(tData);
        setTripDetails(prev => ({
          ...prev,
          to: tData.destination.name || destInput,
          toCoords: { lat: tData.destination.lat, lon: tData.destination.lon },
          distance: `${tData.distance_km.toFixed(1)} km`,
          time: `~ ${tData.duration_min.toFixed(0)} mins`
        }));

        const aiData = await api.aiRecommend({
          user_id: USER_ID,
          distance_km: tData.distance_km,
          duration_min: tData.duration_min,
          aqi: environment.aqi,
          current_action: "cab"
        });
        setRecommendation(aiData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  }, [destInput, tripDetails.fromCoords, environment.aqi]);

  const handleInputChange = useCallback((e) => {
    setDestInput(e.target.value);
  }, []);

  const handleSelect = useCallback(async (item) => {
    setDestInput(item.name);
    setSuggestions([]);
    if (tripDetails.fromCoords) {
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

      api.aiRecommend({
        user_id: USER_ID,
        distance_km: distKm,
        duration_min: estTime,
        aqi: environment.aqi,
        current_action: "cab"
      }).then((aiData) => {
        setRecommendation(aiData);
        return api.tripCompute({
          source_lat: tripDetails.fromCoords.lat,
          source_lon: tripDetails.fromCoords.lon,
          destination: item.name
        });
      }).then((tData) => {
        setTripData(tData);
        if (tData.distance_km) {
          setTripDetails(prev => ({
            ...prev,
            distance: `${tData.distance_km.toFixed(1)} km`,
            time: `~ ${tData.duration_min.toFixed(0)} mins`
          }));
        }
      }).catch((err) => console.error("Background trip/AI update:", err));
    }
  }, [tripDetails.fromCoords, environment.aqi]);

  const handleAction = async (actionStr, accepted) => {
    if (!actionStr) return;
    try {
      const res = await api.trackAction({
        user_id: USER_ID,
        action: actionStr,
        accepted: accepted,
        recommendation_id: recommendation?.recommendation_id || null,
        recommended_action: recommendation?.recommended_action || actionStr,
        distance_km: tripData ? tripData.distance_km : 6.0,
      });
      setUser(prev => ({
        ...prev, 
        green_points: prev.green_points + res.points_delta,
        streak_days: res.streak_days
      }));
      if (res.carbon_score) {
        setImpactData(prev => ({
          ...prev,
          emissionsSaved: prev.emissionsSaved + res.carbon_score,
        }));
      }
      if (accepted) {
        alert(`Success! You chose ${actionStr}. +${res.points_delta} Green Points awarded!`);
      } else {
        setRecommendation(null); // Hide card after dismissal
      }
    } catch (err) {
      console.error("Action tracking failed:", err);
      alert(`Could not save action: ${err.message}`);
    }
  };

  const todayFormatted = useMemo(() =>
    new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
  []);
  const todayWeekday = useMemo(() =>
    new Date().toLocaleDateString('en-GB', { weekday: 'long' }),
  []);

  const isActive = (path) => location.pathname === path;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand px-2 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L4.5 9C3.5 10 3 11 3 12.5C3 15.5 5.5 18 8.5 18C10.5 18 12 17 13 15.5C13 15.5 14.5 18 17.5 18C20.5 18 23 15.5 23 12.5C23 11 22.5 10 21.5 9L14 2H12Z" fill="#10B981" fillOpacity="0.2"/>
              <path d="M14.5 10C16 11 18 10.5 19.5 12C19.833 12.333 20 12.5 21 14C20.5 17 18 20 14.5 21C11.5 21.8571 8.5 20.5 6 18C4.5 16.5 3.5 14 3 12C4 11 6 12 7.5 10C9 8 8 5.5 10 4C11.5 2.875 13.5 3 15 4C14.5 5.5 13 8.5 14.5 10Z" fill="#10B981"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold leading-tight">Carbon<br />Guardian AI</h1>
        </div>

        <nav className="flex flex-col gap-1">
          {nav.map(([Icon, label, path, badge]) => (
            <button 
              key={label} 
              className={`nav-item ${isActive(path) ? "active" : ""}`}
              onClick={() => navigate(path)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {badge === "dot" && <div className="ml-auto w-2 h-2 rounded-full bg-green-success"></div>}
              {badge === "New" && <div className="nav-badge">New</div>}
            </button>
          ))}
        </nav>

        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="mt-6 mx-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-between group"
        >
          <div className="flex items-center gap-3 text-left">
            {theme === "light" ? <Moon size={18} className="text-blue-300" /> : <Sun size={18} className="text-yellow-400" />}
            <span className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">
              {theme === "light" ? "Dark Mode" : "Light Mode"}
            </span>
          </div>
          <div className={`w-8 h-4 rounded-full relative transition-colors ${theme === "dark" ? "bg-green-brand" : "bg-gray-600"}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${theme === "dark" ? "left-4.5" : "left-0.5"}`}></div>
          </div>
        </button>

        <div className="daily-tip mt-auto relative overflow-hidden bg-[#11402e]">
          <h3 className="text-sm font-semibold flex items-center gap-1 mb-2 text-white">
            Daily Green Tip <Leaf size={14} className="text-green-success" />
          </h3>
          <p className="text-xs text-white/80 leading-relaxed relative z-10 mb-8">
            Try cycling or walking for short distances. Small steps, big impact!
          </p>
          <div className="absolute -bottom-2 -right-4 opacity-80 pointer-events-none">
            <svg width="140" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 80 Q 30 60 50 80 T 90 80 L 90 100 L 10 100 Z" fill="#0B3020" />
              <path d="M0 90 Q 20 70 40 90 T 100 80 L 100 100 L 0 100 Z" fill="#0E3D29" />
              <circle cx="50" cy="70" r="12" stroke="#10B981" strokeWidth="2" fill="none"/>
              <circle cx="80" cy="70" r="12" stroke="#10B981" strokeWidth="2" fill="none"/>
              <path d="M50 70 L 65 50 L 75 70" stroke="#10B981" strokeWidth="2" fill="none"/>
              <path d="M60 50 L 55 40 M 60 50 L 65 45" stroke="#10B981" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex-1 flex flex-col"
          >
            <Suspense fallback={<PageLoader />}>
              <Routes location={location}>
                <Route path="/" element={
                  <Dashboard 
                    user={user}
                    environment={environment}
                    tripDetails={tripDetails}
                    destInput={destInput}
                    suggestions={suggestions}
                    recommendation={recommendation}
                    impactData={impactData}
                    todayFormatted={todayFormatted}
                    todayWeekday={todayWeekday}
                    handleInputChange={handleInputChange}
                    handleTripSearch={handleTripSearch}
                    preloadPopularPlaces={preloadPopularPlaces}
                    handleSelect={handleSelect}
                    handleAction={handleAction}
                    setShowCompare={setShowCompare}
                    setShowInfo={setShowInfo}
                    showCompare={showCompare}
                    showInfo={showInfo}
                  />
                } />
                <Route path="/footprint" element={<Footprint />} />
                <Route path="/ai" element={<AIRecommender />} />
                <Route path="/impact" element={<LiveImpact />} />
                <Route path="/points" element={<GreenPoints />} />
                <Route path="/community" element={<Community />} />
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/simulation" element={<Simulation />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
