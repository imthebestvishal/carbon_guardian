from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from sqlite3 import Connection

from app.services.emissions import TRANSPORT_EMISSION_KG_PER_KM, co2_saving

logger = logging.getLogger("carbon_guardian.recommender")

ACTIONS = ["walk", "bike", "bus", "metro", "train", "cab", "airplane", "avoid_travel"]
TRIP_ACTIONS = ["walk", "bike", "bus", "metro", "train", "cab", "airplane"]

# =============================================================================
# Structured transport mode configuration
# min/max = realistic distance range in km; emission = kg CO₂ per km
# =============================================================================
TRANSPORT_MODES = {
    "walk":     {"min": 0,   "max": 1,     "emission": 0.0},
    "bike":     {"min": 0,   "max": 5,     "emission": 0.0},
    "bus":      {"min": 2,   "max": 20,    "emission": 0.08},
    "metro":    {"min": 3,   "max": 30,    "emission": 0.05},
    "train":    {"min": 20,  "max": 500,   "emission": 0.04},
    "cab":      {"min": 1,   "max": 50,    "emission": 0.18},
    "airplane": {"min": 200, "max": 10000, "emission": 0.25},
}


@dataclass
class RankedRecommendation:
    action: str
    score: float
    confidence: float
    estimated_co2_reduction: float
    reason: str


@dataclass
class RecommendationOutput:
    recommendation_id: int
    user_id: int
    top_action: str
    ranked_actions: list[dict]
    confidence: float
    estimated_co2_reduction: float
    model_name: str
    cold_start: bool


def _get_user_profile(db: Connection, user_id: int) -> dict:
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row:
        user = dict(row)
    else:
        # Fallback for missing user (e.g. session without DB seed)
        user = {
            "id": user_id,
            "name": "Guest",
            "email": "guest@carbonguardian.ai",
            "location": "Delhi",
            "preferred_transport": "metro",
            "avg_distance_km": 6.5,
            "carbon_score": 0,
            "green_points": 0,
            "streak_days": 0
        }

    rows = [dict(r) for r in db.execute("SELECT * FROM user_activity WHERE user_id = ?", (user_id,)).fetchall()]
    feedback_rows = [dict(r) for r in db.execute("SELECT * FROM action_feedback WHERE user_id = ?", (user_id,)).fetchall()]
    
    mode_counts: dict[str, int] = {}
    distances = []
    for r in rows:
        mode = r["action"]
        mode_counts[mode] = mode_counts.get(mode, 0) + 1
        distances.append(float(r["distance_km"]))
    
    preferred_transport = max(mode_counts, key=mode_counts.get) if mode_counts else user.get("preferred_transport", "metro")
    avg_distance = sum(distances) / len(distances) if distances else user.get("avg_distance_km", 6.5)
    accepted = sum(1 for r in feedback_rows if r["accepted"])
    acceptance_rate = accepted / len(feedback_rows) if feedback_rows else 0.0
    
    return {
        **user,
        "preferred_transport": preferred_transport,
        "avg_distance_km": round(avg_distance, 2),
        "past_decisions": len(feedback_rows),
        "acceptance_rate": round(acceptance_rate, 2),
    }


class TFRSEmbeddingRecommender:
    def __init__(self) -> None:
        import tensorflow as tf
        import tensorflow_recommenders as tfrs

        self.tf = tf
        self.tfrs = tfrs
        self.model = None

    def _training_examples(self, db: Connection, user_id: int) -> list[dict]:
        rows = [
            dict(row)
            for row in db.execute(
                """
                SELECT user_id, action, time_of_day, location_name, location_aqi, weather_temp, traffic, distance_km, accepted
                FROM user_activity
                WHERE user_id = ?
                ORDER BY datetime(created_at) DESC
                """,
                (user_id,),
            ).fetchall()
        ]
        feedback_rows = [
            dict(row)
            for row in db.execute(
                "SELECT user_id, actual_action, accepted, aqi, temperature, created_at FROM action_feedback WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        ]
        for row in feedback_rows:
            ts = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")) if "T" in row["created_at"] else datetime.utcnow()
            rows.append(
                {
                    "user_id": row["user_id"],
                    "action": row["actual_action"],
                    "time_of_day": ts.hour,
                    "location_name": "feedback",
                    "location_aqi": row["aqi"] or 100,
                    "weather_temp": row["temperature"] or 28,
                    "traffic": 55,
                    "distance_km": 5.0,
                    "accepted": row["accepted"],
                }
            )
        return rows

    def _build_model(self, user_vocab: list[str], action_vocab: list[str]):
        tf = self.tf
        tfrs = self.tfrs

        class RankingModel(tfrs.models.Model):
            def __init__(self, user_vocab: list[str], action_vocab: list[str]) -> None:
                super().__init__()
                self.user_lookup = tf.keras.layers.StringLookup(vocabulary=user_vocab, mask_token=None)
                self.action_lookup = tf.keras.layers.StringLookup(vocabulary=action_vocab, mask_token=None)
                self.user_embed = tf.keras.layers.Embedding(len(user_vocab) + 1, 16)
                self.action_embed = tf.keras.layers.Embedding(len(action_vocab) + 1, 16)
                self.context_dense = tf.keras.Sequential(
                    [tf.keras.layers.Dense(32, activation="relu"), tf.keras.layers.Dense(16, activation="relu")]
                )
                self.output_layer = tf.keras.layers.Dense(1)
                self.task = tfrs.tasks.Ranking(loss=tf.keras.losses.BinaryCrossentropy(from_logits=True))

            def call(self, inputs):
                user_tokens = self.user_lookup(inputs["user_id"])
                action_tokens = self.action_lookup(inputs["action"])
                user_vec = self.user_embed(user_tokens)
                action_vec = self.action_embed(action_tokens)
                context = tf.stack(
                    [
                        tf.cast(inputs["time_of_day"], tf.float32) / 23.0,
                        tf.cast(inputs["aqi"], tf.float32) / 300.0,
                        tf.cast(inputs["temperature"], tf.float32) / 50.0,
                        tf.cast(inputs["traffic"], tf.float32) / 100.0,
                        tf.cast(inputs["distance"], tf.float32) / 30.0,
                    ],
                    axis=1,
                )
                context_vec = self.context_dense(context)
                x = tf.concat([user_vec, action_vec, context_vec], axis=1)
                return self.output_layer(x)

            def compute_loss(self, features, training=False):
                labels = features["label"]
                model_inputs = {key: value for key, value in features.items() if key != "label"}
                predictions = self(model_inputs)
                return self.task(labels=labels, predictions=predictions)

        return RankingModel(user_vocab, action_vocab)

    def train(self, db: Connection, user_id: int) -> bool:
        tf = self.tf
        rows = self._training_examples(db, user_id)
        if len(rows) < 8:
            return False
        user_vocab = sorted({str(row["user_id"]) for row in rows})
        action_vocab = ACTIONS
        examples = []
        for row in rows:
            for action in ACTIONS:
                label = 1.0 if action == row["action"] else 0.0
                if row["accepted"] and action == row["action"]:
                    label = 1.0
                elif not row["accepted"] and action == row["action"]:
                    label = 0.25
                examples.append(
                    {
                        "user_id": str(row["user_id"]),
                        "action": action,
                        "time_of_day": int(row["time_of_day"]),
                        "aqi": float(row["location_aqi"]),
                        "temperature": float(row["weather_temp"]),
                        "traffic": float(row["traffic"]),
                        "distance": float(row["distance_km"]),
                        "label": label,
                    }
                )
        tensor_data = {
            key: tf.constant([item[key] for item in examples]) for key in ["user_id", "action", "time_of_day", "aqi", "temperature", "traffic", "distance", "label"]
        }
        dataset = tf.data.Dataset.from_tensor_slices(tensor_data).shuffle(len(examples)).batch(64)
        model = self._build_model(user_vocab, action_vocab)
        model.compile(optimizer=tf.keras.optimizers.Adagrad(0.08))
        model.fit(dataset, epochs=6, verbose=0)
        self.model = model
        return True

    def rank(self, user_id: int, aqi: float, temp: float, traffic: float, distance: float, hour: int, baseline_action: str) -> list[RankedRecommendation]:
        tf = self.tf
        if self.model is None:
            return []
        features = {
            "user_id": tf.constant([str(user_id)] * len(ACTIONS)),
            "action": tf.constant(ACTIONS),
            "time_of_day": tf.constant([hour] * len(ACTIONS)),
            "aqi": tf.constant([aqi] * len(ACTIONS), dtype=tf.float32),
            "temperature": tf.constant([temp] * len(ACTIONS), dtype=tf.float32),
            "traffic": tf.constant([traffic] * len(ACTIONS), dtype=tf.float32),
            "distance": tf.constant([distance] * len(ACTIONS), dtype=tf.float32),
        }
        logits = self.model(features).numpy().reshape(-1)
        exps = [float(x) for x in logits]
        shifted = [x - max(exps) for x in exps]
        import math

        probs = [math.exp(x) for x in shifted]
        total = sum(probs) or 1.0
        valid_modes = get_valid_modes(distance)
        ranked: list[RankedRecommendation] = []
        for action, raw in zip(ACTIONS, probs):
            confidence = raw / total

            # Boost heuristics based on distance, AQI, and mode validity
            if action not in valid_modes:
                confidence *= 0.05  # heavily penalise out-of-range modes
            elif action == "walk":
                if distance <= 1.0 and aqi < 100:
                    confidence += 0.6
                else:
                    confidence -= 0.4
            elif action == "bike":
                if distance <= 5.0 and aqi < 150:
                    confidence += 0.5
                else:
                    confidence -= 0.3
            elif action == "bus":
                if 2.0 <= distance <= 20.0:
                    confidence += 0.35
            elif action == "metro":
                if distance > 3.0:
                    confidence += 0.4
            elif action == "train":
                if distance >= 20.0:
                    confidence += 0.45
            elif action == "cab":
                if aqi >= 200 or distance >= 15.0:
                    confidence += 0.3
            elif action == "airplane":
                if distance >= 200.0:
                    confidence += 0.5
                else:
                    confidence *= 0.01  # absurd for short trips

            confidence = max(0.01, confidence)

            reduction = co2_saving(baseline_action, action, distance)
            ranked.append(
                RankedRecommendation(
                    action=action,
                    score=round(raw, 4),
                    confidence=confidence,
                    estimated_co2_reduction=reduction,
                    reason="AI ranking adjusted by environmental context and distance."
                )
            )

        # Re-normalize confidence
        new_total = sum(r.confidence for r in ranked)
        for r in ranked:
            r.confidence = round(r.confidence / new_total, 3)

        return sorted(ranked, key=lambda item: (item.confidence, item.estimated_co2_reduction), reverse=True)


# =============================================================================
# 🔴 HARD RULE LAYER — multi-modal distance-based filtering & overrides
# =============================================================================

def get_valid_modes(distance_km: float) -> list[str]:
    """Return transport modes whose distance range includes the given distance."""
    valid = []
    for mode, config in TRANSPORT_MODES.items():
        if config["min"] <= distance_km <= config["max"]:
            valid.append(mode)
    return valid if valid else ["cab"]  # fallback so we never return empty


def calculate_emission(mode: str, distance_km: float) -> float:
    """Calculate CO₂ emission (kg) for a mode over a given distance."""
    factor = TRANSPORT_MODES.get(mode, {}).get("emission", TRANSPORT_EMISSION_KG_PER_KM.get(mode, 0.192))
    return round(factor * distance_km, 3)


def _apply_distance_rules(distance_km: float, aqi: float, model_action: str) -> str:
    """Enforce realistic transport recommendations based on distance.

    Pipeline: distance filter → hard rules → model fallback (constrained to valid modes).
    """
    valid_modes = get_valid_modes(distance_km)

    # ── 🔴 SHORT DISTANCE OVERRIDE ──
    if distance_km <= 0.5:
        return "walk"

    if distance_km <= 2.0:
        return "bike"

    # ── 🟡 MEDIUM DISTANCE (≤ 10 km) ──
    if distance_km <= 10.0:
        if aqi > 150:
            return "metro" if "metro" in valid_modes else "bus" if "bus" in valid_modes else "cab"
        return "bike" if "bike" in valid_modes else "bus" if "bus" in valid_modes else "metro"

    # ── 🔵 LONG DISTANCE (≤ 100 km) ──
    if distance_km <= 100.0:
        if aqi > 150:
            return "train" if "train" in valid_modes else "metro" if "metro" in valid_modes else "cab"
        return "bus" if "bus" in valid_modes else "train" if "train" in valid_modes else "metro"

    # ── ✈️ VERY LONG DISTANCE (> 200 km) ──
    if distance_km > 200.0:
        return "airplane"

    # ── 🟢 GAP ZONE (100-200 km): model fallback constrained to valid modes ──
    if model_action in valid_modes:
        return model_action

    return valid_modes[0]


def _generate_reason(mode: str, distance_km: float, aqi: float) -> str:
    """Human-readable explanation for the recommendation."""
    if distance_km <= 0.5:
        return "Very short distance — walking is fastest and zero emission."

    if distance_km <= 2.0:
        return "Short trip — biking is efficient and eco-friendly."

    if distance_km <= 5.0:
        if mode == "metro":
            return "High AQI — metro reduces pollution exposure."
        if mode == "bus":
            return "Bus is practical and low emission for this distance."
        return "Moderate distance — biking is efficient."

    if distance_km <= 10.0:
        if mode == "metro":
            return "Metro is fast and low emission for medium distances."
        if mode == "bus":
            return "Bus covers this distance efficiently with low emissions."
        return "Medium distance — public transit recommended."

    if distance_km <= 100.0:
        if mode == "train":
            return "Train is the most efficient option for long distances."
        if mode == "bus":
            return "Bus is a practical low-emission choice for this range."
        if mode == "metro":
            return "Metro covers this corridor with low emissions."
        return "Long distance — rail or bus recommended."

    if mode == "airplane":
        return "Very long distance — air travel is the only practical option."

    if mode == "train":
        return "Train offers efficient long-distance travel with low emissions."

    if mode == "cab":
        return "Cab recommended given current conditions."

    return "Balanced recommendation based on distance, AQI, and your profile."


def _baseline_action(profile: dict) -> str:
    preferred = profile.get("preferred_transport", "metro")
    return preferred if preferred in TRANSPORT_EMISSION_KG_PER_KM else "cab"


def get_recommendation(
    db: Connection,
    user_id: int,
    *,
    aqi: float,
    temperature: float,
    traffic: float,
    distance_km: float,
    time_of_day: int,
) -> RecommendationOutput:
    profile = _get_user_profile(db, user_id)
    base_action = _baseline_action(profile)
    cold_start = profile["past_decisions"] < 3

    try:
        tf_model = TFRSEmbeddingRecommender()
        trained = tf_model.train(db, user_id)
        if trained:
            ranked = tf_model.rank(user_id, aqi, temperature, traffic, distance_km, time_of_day, base_action)
    except Exception as exc:
        logger.warning(f"AI Model unavailable, falling back: {exc}")
        trained = False
        ranked = []

    model_name = "tensorflow-recommenders" if trained and ranked else "rule-based-fallback"

    if ranked:
        model_top = ranked[0]
        model_action = model_top.action
    else:
        model_top = RankedRecommendation(action=base_action, score=1.0, confidence=1.0, estimated_co2_reduction=0.0, reason="Fallback")
        model_action = base_action
        ranked = [model_top]

    # --- 🔥 RULE LAYER: override model for short distances ---
    final_action = _apply_distance_rules(distance_km, aqi, model_action)

    # Debug logging (MANDATORY)
    logger.info("[get_recommendation] Distance: %.2f km", distance_km)
    logger.info("[get_recommendation] AQI: %.1f", aqi)
    logger.info("[get_recommendation] Model output: %s", model_top.action)
    logger.info("[get_recommendation] Final recommendation: %s", final_action)
    print(f"[get_recommendation] Distance: {distance_km}, AQI: {aqi}, Model output: {model_top.action}, Final recommendation: {final_action}")

    # If rule layer changed the action, re-sort ranked list so final_action is on top
    if final_action != model_top.action:
        for r in ranked:
            if r.action == final_action:
                r.confidence = max(r.confidence, model_top.confidence) + 0.01
                r.reason = _generate_reason(final_action, distance_km, aqi)
                break
        ranked = sorted(ranked, key=lambda item: (item.confidence, item.estimated_co2_reduction), reverse=True)

    top = ranked[0]
    ranked_payload = [item.__dict__ for item in ranked]
    impact_percent = int(_impact_percent("cab", final_action))
    cursor = db.execute(
        """
        INSERT INTO recommendations
        (user_id, prediction, recommendation, impact_percent, top_action, ranked_actions_json, confidence, estimated_co2_reduction, model_name, context_aqi, context_temp, context_traffic, context_distance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            f"Likely next action: {base_action}",
            f"Use {final_action}",
            impact_percent,
            final_action,
            json.dumps(ranked_payload),
            top.confidence,
            top.estimated_co2_reduction,
            model_name,
            aqi,
            temperature,
            traffic,
            distance_km,
        ),
    )

    return RecommendationOutput(
        recommendation_id=cursor.lastrowid,
        user_id=user_id,
        top_action=final_action,
        ranked_actions=ranked_payload,
        confidence=top.confidence,
        estimated_co2_reduction=top.estimated_co2_reduction,
        model_name=model_name,
        cold_start=cold_start,
    )


def update_weights_with_feedback(db: Connection, user_id: int, recommended_action: str | None, actual_action: str, accepted: bool) -> None:
    for action in ACTIONS:
        db.execute(
            "INSERT OR IGNORE INTO model_weights (user_id, action, weight) VALUES (?, ?, 1)",
            (user_id, action),
        )
    if accepted:
        db.execute(
            "UPDATE model_weights SET weight = MIN(weight + 0.15, 2.5), updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND action = ?",
            (user_id, actual_action),
        )
    else:
        if recommended_action:
            db.execute(
                "UPDATE model_weights SET weight = MAX(weight - 0.12, 0.35), updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND action = ?",
                (user_id, recommended_action),
            )
        db.execute(
            "UPDATE model_weights SET weight = MIN(weight + 0.06, 2.5), updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND action = ?",
            (user_id, actual_action),
        )


def _impact_percent(current_action: str, new_action: str) -> float:
    current = TRANSPORT_EMISSION_KG_PER_KM.get(current_action, TRANSPORT_EMISSION_KG_PER_KM["cab"])
    new = TRANSPORT_EMISSION_KG_PER_KM.get(new_action, TRANSPORT_EMISSION_KG_PER_KM["cab"])
    if current <= 0:
        return 0.0
    return round(max(0.0, ((current - new) / current) * 100.0), 1)


def recommend_for_trip(
    db: Connection,
    user_id: int,
    *,
    distance_km: float,
    duration_min: float,
    aqi: float,
    current_action: str = "cab",
) -> dict:
    try:
        profile = _get_user_profile(db, user_id)
        base_action = current_action if current_action in TRANSPORT_EMISSION_KG_PER_KM else "cab"

        tf_model = None
        trained = False
        model_conf = 0.5
        model_action = base_action
        ranked = []
        
        try:
            tf_model = TFRSEmbeddingRecommender()
            trained = tf_model.train(db, user_id)
            if trained:
                ranked = tf_model.rank(
                    user_id=user_id,
                    aqi=aqi,
                    temp=28.0,
                    traffic=60.0,
                    distance=distance_km,
                    hour=datetime.now().hour,
                    baseline_action=base_action,
                )
                if ranked:
                    model_action = next((r.action for r in ranked if r.action in TRIP_ACTIONS), base_action)
                    model_conf = next((r.confidence for r in ranked if r.action == model_action), 0.5)
        except Exception as exc:
            logger.warning(f"AI Model unavailable, falling back: {exc}")

        # --- 🔥 RULE LAYER: override model for short distances ---
        final_mode = _apply_distance_rules(distance_km, aqi, model_action)
        reason = _generate_reason(final_mode, distance_km, aqi)

        # If rule layer overrode the model, use the overridden confidence
        recommended_conf = model_conf
        if final_mode != model_action:
            override_conf = next((r.confidence for r in ranked if r.action == final_mode), model_conf)
            recommended_conf = max(override_conf, model_conf)

        impact = _impact_percent(base_action, final_mode)

        # Build alternatives for ALL 7 trip-eligible modes
        MODE_SPEEDS = {
            "walk": 4.8, "bike": 14.0, "bus": 25.0, "metro": 35.0, "train": 80.0, "cab": 30.0, "airplane": 800.0,
        }
        valid_modes = get_valid_modes(distance_km)
        alternatives = []
        for action in TRIP_ACTIONS:
            speed = MODE_SPEEDS.get(action, 26.0)
            alt_time = round((distance_km / max(speed, 0.1)) * 60.0, 1)
            emissions = calculate_emission(action, distance_km)
            alternatives.append({
                "action": action,
                "emissions": emissions,
                "time_min": alt_time,
                "impact_percent_vs_current": _impact_percent(base_action, action),
                "valid": action in valid_modes,
            })

        options = [
            {"mode": m, "emission": calculate_emission(m, distance_km), "valid": m in valid_modes}
            for m in TRANSPORT_MODES.keys()
        ]

        # Persist the recommendation
        cursor = db.execute(
            """
            INSERT INTO recommendations
            (user_id, top_action, ranked_actions_json, confidence, estimated_co2_reduction, model_name, context_aqi, context_temp, context_traffic, context_distance)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, final_mode, json.dumps(alternatives), float(recommended_conf), calculate_emission(final_mode, distance_km), "fallback-engine", aqi, 28.0, 60.0, distance_km),
        )

        return {
            "recommendation_id": cursor.lastrowid,
            "recommended_action": final_mode,
            "impact_percent": impact,
            "confidence": round(float(recommended_conf), 3),
            "reason": reason,
            "factors": {
                "aqi": float(aqi),
                "distance_km": float(distance_km),
                "duration_min": float(duration_min),
                "emissions": {
                    "current": TRANSPORT_EMISSION_KG_PER_KM.get(base_action, TRANSPORT_EMISSION_KG_PER_KM["cab"]),
                    "recommended": calculate_emission(final_mode, distance_km),
                },
                "model_action": model_action,
                "rule_override": final_mode != model_action,
                "current_action": base_action,
                "valid_modes": valid_modes,
            },
            "alternatives": alternatives,
            "options": options,
            "model_name": "rule-based-engine",
            "user_preference": profile.get("preferred_transport"),
        }
    except Exception as global_exc:
        logger.exception("Global failure in recommend_for_trip")
        # Final emergency fallback to prevent 500 error
        return {
            "recommendation_id": 0,
            "recommended_action": current_action,
            "impact_percent": 0.0,
            "confidence": 0.5,
            "reason": "Safe fallback recommendation (Internal System Check)",
            "factors": {"aqi": aqi, "distance_km": distance_km},
            "alternatives": [],
            "options": [],
            "model_name": "emergency-fallback"
        }
