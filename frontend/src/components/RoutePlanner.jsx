import { Loader2, MapPin, Navigation, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api.js";

const MODE_TO_ACTION = {
  driving_car: "cab",
  cycling_regular: "bike",
  foot_walking: "walk",
};

const ACTION_LABEL = {
  walk: "Walk",
  bike: "Bike",
  metro: "Metro",
  cab: "Cab",
};

function actionFromMode(mode) {
  return MODE_TO_ACTION[mode] || "cab";
}

function LeafletMap({ trip }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current || !window.L || mapInstance.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([28.6139, 77.209], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    mapInstance.current = map;
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !trip) return;
    const L = window.L;
    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current = [];

    const fastest = trip.best?.fastest;
    const route = trip.routes?.find((item) => item.mode === fastest) || trip.routes?.[0];
    if (!route) return;

    const latLngs = (route.geometry || []).map(([lon, lat]) => [lat, lon]);
    if (!latLngs.length) return;

    const polyline = L.polyline(latLngs, { color: "#0a8f3f", weight: 5 }).addTo(map);
    const src = L.marker([trip.source.lat, trip.source.lon]).addTo(map).bindPopup("Source");
    const dst = L.marker([trip.destination.lat, trip.destination.lon]).addTo(map).bindPopup("Destination");
    layersRef.current.push(polyline, src, dst);
    map.fitBounds(polyline.getBounds(), { padding: [24, 24] });
  }, [trip]);

  return <div ref={mapRef} style={{ height: 280, borderRadius: 10, overflow: "hidden" }} />;
}

export function RoutePlanner({ userId = 1, onAccepted }) {
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState("");
  const [trip, setTrip] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [postingFeedback, setPostingFeedback] = useState(false);
  const [error, setError] = useState("");

  const alternatives = useMemo(() => recommendation?.alternatives || [], [recommendation]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is unavailable in this browser.");
      return;
    }
    setLoadingGeo(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setSource({
          lat: coords.latitude,
          lon: coords.longitude,
          label: `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
        });
        setLoadingGeo(false);
      },
      () => {
        setLoadingGeo(false);
        setError("Unable to detect source location.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function computeAndRecommend(event) {
    event?.preventDefault();
    if (!source) {
      setError("Click 'Use My Location' first.");
      return;
    }
    if (!destination.trim()) {
      setError("Enter destination.");
      return;
    }
    setLoadingTrip(true);
    setError("");
    try {
      const tripData = await api.tripCompute({
        source_lat: source.lat,
        source_lon: source.lon,
        destination: destination.trim(),
      });
      setTrip(tripData);
      const rec = await api.aiRecommend({
        user_id: userId,
        distance_km: tripData.distance_km,
        duration_min: tripData.duration_min,
        aqi: tripData.aqi,
        current_action: actionFromMode(tripData.best?.fastest),
      });
      setRecommendation(rec);
    } catch (requestError) {
      setError(String(requestError.message || requestError));
      setTrip(null);
      setRecommendation(null);
    } finally {
      setLoadingTrip(false);
    }
  }

  async function sendFeedback(accepted) {
    if (!recommendation) return;
    setPostingFeedback(true);
    setError("");
    try {
      await api.trackAction({
        user_id: userId,
        action: recommendation.recommended_action,
        accepted,
        recommended_action: recommendation.recommended_action,
        distance_km: trip?.distance_km || 0,
      });
      onAccepted?.();
    } catch (requestError) {
      setError(String(requestError.message || requestError));
    } finally {
      setPostingFeedback(false);
    }
  }

  return (
    <section className="card" data-reveal>
      <h3>Your Trip Details</h3>
      <form className="route-form" onSubmit={computeAndRecommend}>
        <div className="input-wrap">
          <MapPin size={16} />
          <input value={source?.label || ""} readOnly placeholder="Source from geolocation" />
        </div>
        <div className="input-wrap">
          <Navigation size={16} />
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination" />
        </div>
        <button className="route-btn secondary-btn" type="button" onClick={useMyLocation} disabled={loadingGeo || loadingTrip}>
          {loadingGeo ? <Loader2 size={15} /> : <MapPin size={16} />} Use My Location
        </button>
        <button className="route-btn" type="submit" disabled={loadingTrip || postingFeedback}>
          {loadingTrip ? <Loader2 size={15} /> : <Search size={16} />} Find Routes
        </button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      {trip ? (
        <>
          <div className="route-comparison" style={{ marginTop: 16 }}>
            <p>
              <b>From</b>: {trip.source.lat.toFixed(6)}, {trip.source.lon.toFixed(6)} | <b>To</b>: {trip.destination.name}
            </p>
            <p>
              <b>Distance</b>: {trip.distance_km} km | <b>Time</b>: {trip.duration_min} min | <b>AQI</b>: {trip.aqi} ({trip.aqi_label})
            </p>
          </div>
          <LeafletMap trip={trip} />
        </>
      ) : null}

      {recommendation ? (
        <div className="ai-panel" style={{ marginTop: 16 }}>
          <h3>AI Recommendation for You</h3>
          <p className="prediction">Recommended action: <b>{ACTION_LABEL[recommendation.recommended_action] || recommendation.recommended_action}</b></p>
          <p>
            Impact: <b>{recommendation.impact_percent}%</b> | Confidence: <b>{Math.round((recommendation.confidence || 0) * 100)}%</b>
          </p>
          <p>{recommendation.reason}</p>
          <div className="choice" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button id="accept-btn" onClick={() => sendFeedback(true)} disabled={postingFeedback}>
              {postingFeedback ? "Saving..." : "Accept Recommendation"}
            </button>
            <button id="reject-btn" onClick={() => sendFeedback(false)} disabled={postingFeedback}>
              Reject
            </button>
          </div>

          <div className="route-results" style={{ marginTop: 14 }}>
            <h4>Why this recommendation</h4>
            <p>AQI: {recommendation.factors.aqi} | Distance: {recommendation.factors.distance_km} km</p>
            <p>
              Emissions: current {recommendation.factors.emissions.current} vs recommended {recommendation.factors.emissions.recommended}
            </p>
            <h4 style={{ marginTop: 10 }}>Alternative options</h4>
            <div className="route-comparison">
              {alternatives.map((alt) => (
                <div key={alt.action} className={`route-row ${alt.action === recommendation.recommended_action ? "is-best" : ""}`}>
                  <strong>{ACTION_LABEL[alt.action] || alt.action}</strong>
                  <span>{alt.time_min} min</span>
                  <span>{alt.emissions}</span>
                  <span>{alt.impact_percent_vs_current}% impact</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
