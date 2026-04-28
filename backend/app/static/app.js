const state = {
  recommendationId: null,
  recommendationAction: "metro",
  points: 0,
  environment: { city: "Location unavailable", area: "Location unavailable", aqi: 100, temperature: 28 },
  position: null,
  positionAccuracyM: null,
  pollTimer: null,
  geoWatchId: null,
  lastEnvRefreshMs: 0,
  bestFix: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function mapAqiLabel(aqi) {
  const numeric = Number(aqi);
  if (!Number.isFinite(numeric)) return "Healthy";
  if (numeric <= 80) return "Healthy";
  if (numeric <= 200) return "Unhealthy";
  return "Hazardous";
}

function rafNumber({ from = 0, to, duration = 900, onUpdate, decimals = 0 }) {
  let frame = 0;
  let start = 0;
  const tick = (timestamp) => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = from + (to - from) * eased;
    onUpdate(Number(value.toFixed(decimals)));
    if (progress < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let detail = `${path} failed`;
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      detail = `${path} failed`;
    }
    throw new Error(detail);
  }
  return response.json();
}

function setupReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        requestAnimationFrame(() => entry.target.classList.add("is-visible"));
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -40px 0px" },
  );
  $$(".reveal").forEach((node) => observer.observe(node));
}

function animateGauge(score) {
  const gauge = $("#gauge-value");
  const scoreNumber = $("#score-number");
  const circumference = 502;
  rafNumber({
    to: score,
    duration: 1200,
    onUpdate: (value) => {
      scoreNumber.textContent = Math.round(value);
      const dash = circumference * Math.min(value / 1000, 1);
      gauge.style.strokeDasharray = `${dash} ${circumference}`;
    },
  });
}

function animateCounters() {
  $$("[data-count]").forEach((node) => {
    const target = Number(node.dataset.count);
    rafNumber({
      to: target,
      duration: 900,
      decimals: target < 10 ? 1 : 0,
      onUpdate: (value) => {
        node.textContent = target < 10 ? value.toFixed(1) : Math.round(value);
      },
    });
  });
}

function animateChart() {
  const line = $("#chart-line");
  const dots = $("#chart-dots");
  const points = [
    [28, 60],
    [75, 87],
    [122, 62],
    [169, 99],
    [216, 79],
    [263, 92],
    [310, 72],
  ];
  dots.innerHTML = points.map(([x, y]) => `<circle class="chart-dot" cx="${x}" cy="${y}" r="4.5"></circle>`).join("");
  rafNumber({
    to: 1,
    duration: 1100,
    decimals: 3,
    onUpdate: (value) => {
      line.style.strokeDashoffset = String(1 - value);
      $$(".chart-dot").forEach((dot) => {
        dot.style.opacity = value;
      });
    },
  });
}

function renderRewards(activity) {
  const list = $("#activity-list");
  const rows = activity.length
    ? activity.slice(0, 5).map((item) => ({ source: item.action, points: item.accepted ? 50 : -10 }))
    : [{ source: "No activity yet", points: 0 }];
  list.innerHTML =
    "<h4>Recent Activity</h4>" +
    rows.map((reward) => `<p><span>${reward.source}</span><b>${reward.points > 0 ? "+" : ""}${reward.points}</b></p>`).join("") +
    "<a>View All Activities</a>";
}

function updatePoints(next) {
  const previous = state.points;
  state.points = next;
  rafNumber({
    from: previous,
    to: next,
    duration: 700,
    onUpdate: (value) => {
      const formatted = Math.round(value).toLocaleString();
      $("#top-points").textContent = formatted;
      $("#points-total").textContent = formatted;
    },
  });
}

function applyBestFix(position) {
  const next = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    ts: Date.now(),
  };
  if (!state.bestFix || next.accuracy < state.bestFix.accuracy) {
    state.bestFix = next;
  }
  state.position = { lat: state.bestFix.lat, lon: state.bestFix.lon };
  state.positionAccuracyM = state.bestFix.accuracy;
}

async function fetchEnvironment() {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not available in this browser.");
  }
  return new Promise((resolve, reject) => {
    const samplingWindowMs = 12000;
    const finishTimer = setTimeout(async () => {
      if (state.geoWatchId !== null) {
        navigator.geolocation.clearWatch(state.geoWatchId);
        state.geoWatchId = null;
      }
      if (!state.bestFix) {
        reject(new Error("Could not get a precise location fix. Check Wi-Fi/location settings."));
        return;
      }
      try {
        const env = await api(`/api/environment?lat=${state.bestFix.lat}&lon=${state.bestFix.lon}`);
        resolve(env);
      } catch (error) {
        reject(error);
      }
    }, samplingWindowMs);

    state.bestFix = null;
    state.geoWatchId = navigator.geolocation.watchPosition(
      (position) => {
        applyBestFix(position);
        if (state.positionAccuracyM <= 60) {
          clearTimeout(finishTimer);
          navigator.geolocation.clearWatch(state.geoWatchId);
          state.geoWatchId = null;
          api(`/api/environment?lat=${state.position.lat}&lon=${state.position.lon}`).then(resolve).catch(reject);
        }
      },
      () => {
        clearTimeout(finishTimer);
        reject(new Error("Location permission denied or location unavailable."));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

function startGeoWatch() {
  if (!navigator.geolocation) return;
  if (state.geoWatchId !== null) return;
  state.geoWatchId = navigator.geolocation.watchPosition(
    (position) => {
      applyBestFix(position);
      refreshEnvironmentOnly();
    },
    () => {
      // Keep existing data; status line in refresh flow already communicates failures.
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
}

function locationText(env) {
  const area = env.area || env.local_area || "";
  const city = env.city || "";
  const lat = Number(env.lat);
  const lon = Number(env.lon);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
  const coords = hasCoords ? ` (${lat.toFixed(4)}, ${lon.toFixed(4)})` : "";
  const name = area && city ? `${area}, ${city}` : city || "Location unavailable";
  return `${name}${coords}`;
}

function environmentStatusText(env) {
  const liveState = env.realtime ? "Live" : "Cached";
  const accuracy = Number.isFinite(state.positionAccuracyM) ? ` | Location ±${Math.round(state.positionAccuracyM)}m` : "";
  const detail = env.detail ? ` | ${env.detail}` : "";
  return `${liveState} environment updated at ${new Date().toLocaleTimeString()}${accuracy}${detail}`;
}

async function refreshEnvironmentOnly() {
  if (!state.position) return;
  const now = Date.now();
  if (now - state.lastEnvRefreshMs < 180000) return;
  state.lastEnvRefreshMs = now;
  try {
    const env = await api(`/api/environment?lat=${state.position.lat}&lon=${state.position.lon}`);
    state.environment = env;
    $("#live-location").textContent = locationText(env);
    $("#aqi").textContent = Math.round(env.aqi || 0);
    $("#aqi-area").textContent = env.aqi_label || mapAqiLabel(env.aqi || 0);
    $("#temp").textContent = `${Math.round(env.temperature || 0)} C`;
    $("#status-line").textContent = environmentStatusText(env);
  } catch (error) {
    $("#status-line").textContent = `Environment refresh failed: ${String(error.message || error)}`;
  }
}

async function getRecommendation() {
  const rec = await api(
    `/api/recommendation/1?aqi=${state.environment.aqi || 100}&temperature=${state.environment.temperature || 28}&traffic=60&distance_km=6&time_of_day=${new Date().getHours()}`,
  );
  state.recommendationId = rec.recommendation_id;
  state.recommendationAction = rec.top_action;
  $("#prediction").textContent = rec.cold_start
    ? "Cold start active. Model is using context with fallback logic."
    : `Predicted action: ${rec.top_action}`;
  $("#recommendation").textContent = `Use ${rec.top_action} today`;
  $("#impact").textContent = `${Math.round(Math.min(95, rec.estimated_co2_reduction * 100))}%`;
  $("#confidence").textContent = `${Math.round(rec.confidence * 100)}%`;
  $("#status-line").textContent = `AI model: ${rec.model_name}`;
}

async function refreshCarbonScore() {
  const score = await api("/api/carbon-score/1");
  if (score.score == null) {
    animateGauge(0);
    $("#score-number").textContent = "0";
    return;
  }
  const gaugeValue = Math.max(0, Math.round(score.score * 100));
  animateGauge(gaugeValue);
}

async function loadData() {
  try {
    const [profile, env] = await Promise.all([api("/api/user/1"), fetchEnvironment()]);
    state.environment = env;
    $("#profile-name").textContent = profile.name;
    $("#hero-name").textContent = profile.name;
    $("#profile-level").textContent = `Streak ${profile.streak_days || 0} days`;
    state.points = profile.green_points;
    $("#top-points").textContent = profile.green_points.toLocaleString();
    $("#points-total").textContent = profile.green_points.toLocaleString();
    renderRewards(profile.recent_activity || []);

    $("#live-location").textContent = locationText(env);
    $("#aqi").textContent = Math.round(env.aqi || 0);
    $("#aqi-area").textContent = env.aqi_label || mapAqiLabel(env.aqi || 0);
    $("#temp").textContent = `${Math.round(env.temperature || 0)} C`;
    $("#status-line").textContent = environmentStatusText(env);

    await getRecommendation();

    await refreshCarbonScore();
  } catch (error) {
    $("#status-line").textContent = String(error.message || error);
    $("#live-location").textContent = "Location unavailable";
    $("#aqi-area").textContent = mapAqiLabel(Number($("#aqi").textContent || 0));
    renderRewards([]);
  }
}

async function acceptChallenge() {
  $("#accept-btn").disabled = true;
  $("#accept-btn").style.opacity = "0.72";
  try {
    const result = await api("/api/action", {
      method: "POST",
      body: JSON.stringify({
        user_id: 1,
        action: state.recommendationAction,
        accepted: true,
        recommendation_id: state.recommendationId,
        recommended_action: state.recommendationAction,
        aqi: state.environment.aqi || 100,
        temperature: state.environment.temperature || 28,
        traffic: 60,
        distance_km: 6,
        energy_kwh: 1.2,
        waste_kg: 0.2,
        location_name: `${state.environment.area || "Area"}, ${state.environment.city || "City"}`,
      }),
    });
    updatePoints(state.points + result.points_delta);
    $("#status-line").textContent = `Challenge accepted: ${result.points_delta > 0 ? "+" : ""}${result.points_delta} points`;
    await Promise.all([getRecommendation(), refreshCarbonScore()]);
  } catch (error) {
    $("#status-line").textContent = String(error.message || error);
  } finally {
    $("#accept-btn").textContent = "Challenge Accepted";
  }
}

async function redeemPoints() {
  const button = $("#redeem-btn");
  button.disabled = true;
  button.style.opacity = "0.72";
  try {
    const result = await api("/api/redeem", {
      method: "POST",
      body: JSON.stringify({ user_id: 1, points: 100, reward_name: "Eco Voucher" }),
    });
    updatePoints(result.remaining_points);
    $("#status-line").textContent = `Redeemed 100 points. Remaining: ${result.remaining_points}`;
  } catch (error) {
    $("#status-line").textContent = String(error.message || error);
  } finally {
    button.disabled = false;
    button.style.opacity = "1";
  }
}

function setupTabs() {
  const buttons = $$("#sidebar-nav button");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-target");
      const target = targetId ? document.getElementById(targetId) : null;
      buttons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        $("#status-line").textContent = `${button.innerText.replace(/\s+/g, " ").trim()} opened`;
      }
    });
  });
}

function setupKnowMore() {
  const button = $("#know-more-btn");
  button.addEventListener("click", async () => {
    const target = document.getElementById("ai-panel-card");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#status-line").textContent = "Refreshing recommendation details...";
    try {
      await getRecommendation();
    } catch (error) {
      $("#status-line").textContent = String(error.message || error);
    }
  });
}

async function runSimulation() {
  const scenario = $("#scenario-select").value;
  const payloadMap = {
    ev_adoption_30: { current_users: 4500000, ev_adoption_percent: 30, avg_daily_km: 16 },
    metro_shift_20: { current_users: 2500000, ev_adoption_percent: 20, avg_daily_km: 12 },
    urban_trees_100k: { current_users: 1800000, ev_adoption_percent: 12, avg_daily_km: 9 },
  };
  const result = await api("/api/simulate", { method: "POST", body: JSON.stringify(payloadMap[scenario]) });
  requestAnimationFrame(() => {
    $("#sim-co2").innerHTML = `${(result.co2_saved / 1000000).toFixed(1)} <small>Million kg</small>`;
    $("#sim-aqi").textContent = `${result.aqi_improvement}%`;
    $("#sim-temp").textContent = `${result.temperature_reduction} C`;
    $(".simulation").animate(
      [
        { transform: "translateY(0) scale(1)", opacity: 1 },
        { transform: "translateY(-4px) scale(1.006)", opacity: 0.96 },
        { transform: "translateY(0) scale(1)", opacity: 1 },
      ],
      { duration: 320, easing: "ease-out" },
    );
  });
}

function boot() {
  setupReveal();
  animateGauge(0);
  animateCounters();
  animateChart();
  loadData();
  setupTabs();
  setupKnowMore();
  $("#accept-btn").addEventListener("click", acceptChallenge);
  $("#run-simulation").addEventListener("click", runSimulation);
  $("#redeem-btn").addEventListener("click", redeemPoints);
  startGeoWatch();
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    refreshEnvironmentOnly();
  }, 180000);
}

boot();
