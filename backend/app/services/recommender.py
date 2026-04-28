from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from sqlite3 import Connection

from app.services.emissions import TRANSPORT_EMISSION_KG_PER_KM, co2_saving

ACTIONS = ["metro", "bike", "walk", "avoid_travel", "cab"]
TRIP_ACTIONS = ["walk", "bike", "metro", "cab"]
EMISSION_FACTORS = {"cab": 120.0, "bike": 0.0, "metro": 40.0, "walk": 0.0}


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
    user = dict(db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
    rows = [dict(row) for row in db.execute("SELECT * FROM user_activity WHERE user_id = ?", (user_id,)).fetchall()]
    feedback_rows = [dict(row) for row in db.execute("SELECT * FROM action_feedback WHERE user_id = ?", (user_id,)).fetchall()]
    mode_counts: dict[str, int] = {}
    distances = []
    for row in rows:
        mode = row["action"]
        mode_counts[mode] = mode_counts.get(mode, 0) + 1
        distances.append(float(row["distance_km"]))
    preferred_transport = max(mode_counts, key=mode_counts.get) if mode_counts else user["preferred_transport"]
    avg_distance = sum(distances) / len(distances) if distances else user["avg_distance_km"]
    accepted = sum(1 for row in feedback_rows if row["accepted"])
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
        ranked: list[RankedRecommendation] = []
        for action, raw in zip(ACTIONS, probs):
            confidence = raw / total
            reduction = co2_saving(baseline_action, action, distance)
            ranked.append(
                RankedRecommendation(
                    action=action,
                    score=round(raw, 4),
                    confidence=round(confidence, 3),
                    estimated_co2_reduction=reduction,
                    reason="TensorFlow Recommenders ranking from behavior and context features.",
                )
            )
        return sorted(ranked, key=lambda item: (item.confidence, item.estimated_co2_reduction), reverse=True)


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
    except Exception as exc:
        raise RuntimeError(f"TensorFlow recommender unavailable: {exc}") from exc

    if not trained:
        raise RuntimeError("TensorFlow model needs more feedback/activity data before serving recommendations.")

    ranked = tf_model.rank(user_id, aqi, temperature, traffic, distance_km, time_of_day, base_action)
    if not ranked:
        raise RuntimeError("TensorFlow model produced no ranked actions.")

    model_name = "tensorflow-recommenders"

    top = ranked[0]
    ranked_payload = [item.__dict__ for item in ranked]
    impact_percent = int(max(0, min(95, round(top.estimated_co2_reduction * 100))))
    cursor = db.execute(
        """
        INSERT INTO recommendations
        (user_id, prediction, recommendation, impact_percent, top_action, ranked_actions_json, confidence, estimated_co2_reduction, model_name, context_aqi, context_temp, context_traffic, context_distance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            f"Likely next action: {base_action}",
            f"Use {top.action}",
            impact_percent,
            top.action,
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
        top_action=top.action,
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
    current = EMISSION_FACTORS.get(current_action, EMISSION_FACTORS["cab"])
    new = EMISSION_FACTORS.get(new_action, EMISSION_FACTORS["cab"])
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
    profile = _get_user_profile(db, user_id)
    base_action = current_action if current_action in EMISSION_FACTORS else "cab"

    tf_model = TFRSEmbeddingRecommender()
    trained = tf_model.train(db, user_id)
    if not trained:
        raise RuntimeError("TensorFlow model needs more user feedback/activity data.")

    ranked = tf_model.rank(
        user_id=user_id,
        aqi=aqi,
        temp=28.0,
        traffic=60.0,
        distance=distance_km,
        hour=datetime.now().hour,
        baseline_action=base_action,
    )
    if not ranked:
        raise RuntimeError("TensorFlow model produced no ranked actions.")

    model_action = next((r.action for r in ranked if r.action in TRIP_ACTIONS), "cab")
    model_conf = next((r.confidence for r in ranked if r.action == model_action), 0.0)
    recommended = model_action
    reason = (
        f"TensorFlow model selected {model_action} using your activity history with AQI {int(round(aqi))} "
        f"and trip distance {distance_km:.2f} km."
    )

    impact = _impact_percent(base_action, recommended)
    recommended_conf = model_conf
    alternatives = []
    for action in TRIP_ACTIONS:
        speed = 4.8 if action == "walk" else 14.0 if action == "bike" else 24.0 if action == "metro" else 26.0
        alt_time = round((distance_km / max(speed, 0.1)) * 60.0, 1)
        alternatives.append(
            {
                "action": action,
                "emissions": EMISSION_FACTORS[action],
                "time_min": alt_time,
                "impact_percent_vs_current": _impact_percent(base_action, action),
            }
        )

    return {
        "recommended_action": recommended,
        "impact_percent": impact,
        "confidence": round(float(recommended_conf), 3),
        "reason": reason,
        "factors": {
            "aqi": float(aqi),
            "distance_km": float(distance_km),
            "duration_min": float(duration_min),
            "emissions": {
                "current": EMISSION_FACTORS.get(base_action, EMISSION_FACTORS["cab"]),
                "recommended": EMISSION_FACTORS[recommended],
            },
            "model_action": model_action,
            "current_action": base_action,
        },
        "alternatives": alternatives,
        "model_name": "tensorflow-recommenders",
        "user_preference": profile.get("preferred_transport"),
    }
