import { ArrowRight, Bot, RefreshCw, TrainFront } from "lucide-react";

export function RecommendationCard({
  recommendation,
  onAccept,
  onRefresh,
  loading = false,
}) {
  return (
    <div className="card ai-card" data-reveal>
      <div className="card-head">
        <h3><Bot size={20} /> Transport Recommendation</h3>
        <button className="icon-action" onClick={onRefresh} aria-label="Refresh recommendation" disabled={loading}>
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="ai-panel">
        <p className="rec-title">{recommendation.title}</p>
        <div className="choice">
          <TrainFront size={44} />
          <div>
            <strong>{recommendation.subtitle}</strong>
            <p>
              Emissions saved: <b>{recommendation.estimated_co2_reduction ?? 0} kg CO2</b>
            </p>
            <p className="rec-explanation">{recommendation.explanation}</p>
            <button className="accept-btn" onClick={onAccept} disabled={loading}>
              Accept Recommendation <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
