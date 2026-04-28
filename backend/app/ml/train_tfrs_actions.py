from __future__ import annotations

import sqlite3
from pathlib import Path

import tensorflow as tf
import tensorflow_recommenders as tfrs

DB_PATH = Path(__file__).resolve().parents[2] / "carbon_guardian.db"
MODEL_DIR = Path(__file__).resolve().parent / "saved_model"


def load_rows() -> list[dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT user_id, action, accepted, COALESCE(aqi, 100) AS aqi, COALESCE(temperature, 28) AS temperature,
                   COALESCE(hour, 12) AS hour
            FROM actions
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


class ActionRetrievalModel(tfrs.models.Model):
    def __init__(self, users: list[str], actions: list[str]):
        super().__init__()
        self.user_lookup = tf.keras.layers.StringLookup(vocabulary=users, mask_token=None)
        self.action_lookup = tf.keras.layers.StringLookup(vocabulary=actions, mask_token=None)
        self.user_model = tf.keras.Sequential(
            [
                self.user_lookup,
                tf.keras.layers.Embedding(len(users) + 1, 32),
            ]
        )
        self.action_model = tf.keras.Sequential(
            [
                self.action_lookup,
                tf.keras.layers.Embedding(len(actions) + 1, 32),
            ]
        )
        self.task = tfrs.tasks.Retrieval(metrics=tfrs.metrics.FactorizedTopK(candidates=tf.data.Dataset.from_tensor_slices(actions).batch(32).map(self.action_model)))

    def compute_loss(self, features, training=False):
        user_embeddings = self.user_model(features["user_id"])
        action_embeddings = self.action_model(features["action"])
        return self.task(user_embeddings, action_embeddings)


def main() -> None:
    rows = load_rows()
    positives = [row for row in rows if int(row["accepted"]) == 1]
    if len(positives) < 20:
        print("Not enough accepted interactions yet. Need at least 20 positive rows in actions table.")
        return

    user_ids = sorted({str(row["user_id"]) for row in positives})
    action_ids = sorted({row["action"] for row in positives})
    ds = tf.data.Dataset.from_tensor_slices(
        {
            "user_id": [str(row["user_id"]) for row in positives],
            "action": [row["action"] for row in positives],
        }
    ).shuffle(len(positives)).batch(64)

    model = ActionRetrievalModel(user_ids, action_ids)
    model.compile(optimizer=tf.keras.optimizers.Adagrad(0.1))
    model.fit(ds, epochs=6, verbose=1)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    tf.saved_model.save(model, str(MODEL_DIR))
    print(f"Saved model to {MODEL_DIR}")


if __name__ == "__main__":
    main()
