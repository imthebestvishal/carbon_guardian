import {
  Bike,
  Bot,
  CalendarDays,
  Car,
  CheckSquare,
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
} from "lucide-react";
import { useEffect, useState } from "react";
import { CarbonGauge } from "./components/CarbonGauge.jsx";
import { RoutePlanner } from "./components/RoutePlanner.jsx";
import { WeeklyChart } from "./components/WeeklyChart.jsx";
import { useRafNumber } from "./hooks/useRafNumber.js";
import { useReveal } from "./hooks/useReveal.js";
import { api } from "./services/api.js";

const USER_ID = 1;

const nav = [
  [Home, "Dashboard"],
  [Leaf, "My Footprint"],
  [Bot, "AI Recommender"],
  [CloudSun, "Live Impact"],
  [Trophy, "Green Points"],
  [Users, "Community"],
  [ShoppingBag, "Marketplace"],
  [FlaskConical, "Simulation Lab"],
  [Settings, "Settings"],
];

function Stat({ icon: Icon, value, label, tone }) {
  const animated = useRafNumber(Number(value) || 0, 900);
  return (
    <div className={`impact-stat ${tone}`}>
      <div><Icon size={28} /></div>
      <b>{Number(value) < 10 ? animated.toFixed(1) : Math.round(animated)}</b>
      <span>{label}</span>
    </div>
  );
}

export default function App() {
  useReveal();

  const [error, setError] = useState("");
  const [user, setUser] = useState({ avg_distance_km: 8, name: "Aarav" });
  const [environment, setEnvironment] = useState({
    city: "Location unavailable",
    area: "Location unavailable",
    aqi: 0,
    aqi_label: "Healthy",
    temperature: 0,
  });
  const [history, setHistory] = useState([]);
  const [carbonScore, setCarbonScore] = useState({ score: null, breakdown: { transport: 0, energy: 0, waste: 0 } });

  const [loadingEnv, setLoadingEnv] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);

  async function refreshUser() {
    const data = await api.user(USER_ID);
    setUser(data);
  }

  async function refreshHistory() {
    setLoadingChart(true);
    try {
      const data = await api.history(USER_ID);
      setHistory(data);
    } finally {
      setLoadingChart(false);
    }
  }

  async function refreshCarbonScore() {
    const data = await api.carbonScore(USER_ID);
    setCarbonScore(data);
  }

  async function fetchEnvironmentFromCoords(lat, lon) {
    setLoadingEnv(true);
    setError("");
    try {
      const env = await api.environment({ lat, lon });
      setEnvironment(env);
      return env;
    } catch (requestError) {
      setError(String(requestError.message || requestError));
      return null;
    } finally {
      setLoadingEnv(false);
    }
  }

  function requestGeolocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is unavailable in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await fetchEnvironmentFromCoords(position.coords.latitude, position.coords.longitude);
      },
      (geoError) => {
        if (geoError.code === 1) setError("Location permission denied.");
        else if (geoError.code === 3) setError("Location request timed out.");
        else setError("Could not read your location.");
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 },
    );
  }

  useEffect(() => {
    Promise.all([refreshUser(), refreshHistory(), refreshCarbonScore()]).then(() => {
      requestGeolocation();
    });
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="planet"><Leaf size={38} /></div>
          <h1>Carbon<br />Guardian AI</h1>
        </div>
        <nav>
          {nav.map(([Icon, label], index) => (
            <button key={label} className={index === 0 ? "active" : ""}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="minimal-main">
        <section className="hello-row">
          <div>
            <h1 className="hello-title">Good Morning, {user.name || "Aarav"}! 👋</h1>
            <p className="hello-subtitle">Together, build a cooler and greener planet.</p>
          </div>
          <div className="hello-actions">
            <div className="points-pill">
              <Leaf size={16} />
              <span>Green Points</span>
              <b>{Math.round(user.green_points || 0)}</b>
            </div>
            <div className="avatar-pill">
              <div className="avatar-circle">{(user.name || "A").slice(0, 1).toUpperCase()}</div>
              <span>
                Hi, {user.name || "Aarav"}
                <small>Streak {user.streak_days || 0} day{(user.streak_days || 0) === 1 ? "" : "s"}</small>
              </span>
            </div>
          </div>
        </section>

        <header className="minimal-header">
          <div className="header-chip">
            <CheckSquare size={16} />
            <span>{environment.area}, {environment.city}</span>
          </div>
          <div className="header-chip">
            <Leaf size={16} />
            <span>AQI {Math.round(environment.aqi || 0)} ({environment.aqi_label || "Healthy"})</span>
          </div>
          <div className="header-chip">
            <Thermometer size={16} />
            <span>{Math.round(environment.temperature || 0)} C</span>
          </div>
          <div className="header-chip">
            <CalendarDays size={16} />
            <span>{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        </header>

        {error ? <div className="status-line" style={{ color: "#b91c1c" }}>{error}</div> : null}

        <section className="decision-layout">
          <div className="decision-left">
            <RoutePlanner
              userId={USER_ID}
              onAccepted={() => Promise.all([refreshUser(), refreshHistory(), refreshCarbonScore()])}
            />
          </div>

          <div className="decision-right">
            {carbonScore.score == null ? (
              <div className="card score-card" data-reveal>
                <h3>Carbon Score</h3>
                <p>No data yet.</p>
              </div>
            ) : (
              <CarbonGauge score={Math.max(0, Math.round(carbonScore.score * 100))} />
            )}

            <div className="card impact-card" data-reveal>
              <h3>Today&apos;s Impact</h3>
              <div className="impact-row minimal-impact">
                <Stat icon={Car} value={carbonScore.breakdown.transport || 0} label="Transport" tone="green" />
                <Stat icon={CloudSun} value={carbonScore.breakdown.energy || 0} label="Energy" tone="yellow" />
                <Stat icon={Bike} value={carbonScore.breakdown.waste || 0} label="Waste" tone="green" />
              </div>
            </div>

            <WeeklyChart data={history} loading={loadingChart} />
          </div>
        </section>

        {loadingEnv ? (
          <div className="status-line">
            <Loader2 size={14} style={{ verticalAlign: "middle", marginRight: 8 }} />
            Updating dashboard...
          </div>
        ) : null}
      </main>
    </div>
  );
}
