from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DB_PATH = Path(__file__).resolve().parent.parent / "carbon_guardian.db"


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                location TEXT NOT NULL DEFAULT 'Unknown',
                preferred_transport TEXT NOT NULL DEFAULT 'metro',
                avg_distance_km REAL NOT NULL DEFAULT 6.0,
                carbon_score REAL NOT NULL DEFAULT 0,
                green_points INTEGER NOT NULL DEFAULT 0,
                streak_days INTEGER NOT NULL DEFAULT 0,
                last_action_date TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                accepted INTEGER NOT NULL DEFAULT 0,
                time_of_day INTEGER NOT NULL,
                location_name TEXT NOT NULL DEFAULT 'Unknown',
                location_aqi REAL NOT NULL DEFAULT 0,
                weather_temp REAL NOT NULL DEFAULT 0,
                traffic REAL NOT NULL DEFAULT 50,
                distance_km REAL NOT NULL DEFAULT 6,
                transport_emissions REAL NOT NULL DEFAULT 0,
                energy_emissions REAL NOT NULL DEFAULT 0,
                waste_emissions REAL NOT NULL DEFAULT 0,
                carbon_score REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS recommendations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                top_action TEXT NOT NULL,
                ranked_actions_json TEXT NOT NULL,
                confidence REAL NOT NULL,
                estimated_co2_reduction REAL NOT NULL,
                model_name TEXT NOT NULL,
                context_aqi REAL NOT NULL,
                context_temp REAL NOT NULL,
                context_traffic REAL NOT NULL,
                context_distance REAL NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS action_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                recommendation_id INTEGER,
                recommended_action TEXT,
                actual_action TEXT NOT NULL,
                accepted INTEGER NOT NULL,
                points_delta INTEGER NOT NULL DEFAULT 0,
                aqi REAL,
                temperature REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(recommendation_id) REFERENCES recommendations(id)
            );

            CREATE TABLE IF NOT EXISTS preferences (
                user_id INTEGER PRIMARY KEY,
                transport TEXT NOT NULL,
                effort TEXT NOT NULL,
                time TEXT NOT NULL,
                goal TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                accepted INTEGER NOT NULL,
                aqi INTEGER,
                temperature REAL,
                hour INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS model_weights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                weight REAL NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, action)
            );

            CREATE TABLE IF NOT EXISTS environment_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                city TEXT NOT NULL,
                local_area TEXT NOT NULL,
                aqi REAL NOT NULL,
                aqi_label TEXT NOT NULL DEFAULT 'Moderate',
                temperature REAL NOT NULL,
                co2_ppm REAL NOT NULL,
                source TEXT NOT NULL,
                aqi_source TEXT NOT NULL DEFAULT 'WAQI',
                temperature_source TEXT NOT NULL DEFAULT 'OpenWeather',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_preferences_user_id ON preferences(user_id);
            CREATE INDEX IF NOT EXISTS idx_actions_user_id ON actions(user_id);
            """
        )
        _migrate_schema(db)


def seed_db() -> None:
    with get_db() as db:
        users = db.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        if users:
            _ensure_user_weights(db, 1)
            return

        db.execute(
            """
            INSERT INTO users (name, email, location, preferred_transport, avg_distance_km, carbon_score, green_points)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("Aarav", "aarav@carbonguardian.ai", "Delhi", "metro", 7.8, 51, 2450),
        )

        samples = [
            ("metro", 1, 8, 136, 32, 68, 8.0, 0.28, 1.20, 0.12),
            ("cab", 0, 9, 144, 34, 82, 8.7, 1.67, 1.30, 0.18),
            ("bike", 1, 18, 121, 30, 46, 3.8, 0.00, 0.60, 0.08),
            ("walk", 1, 13, 118, 29, 22, 1.4, 0.00, 0.20, 0.03),
            ("metro", 1, 17, 132, 31, 73, 7.9, 0.27, 1.10, 0.10),
            ("cab", 0, 19, 151, 33, 84, 9.1, 1.75, 1.50, 0.21),
        ]
        for action, accepted, hour, aqi, temp, traffic, distance, t_kg, e_kg, w_kg in samples:
            score = round(t_kg * 0.5 + e_kg * 0.3 + w_kg * 0.2, 2)
            db.execute(
                """
                INSERT INTO user_activity
                (user_id, action, accepted, time_of_day, location_name, location_aqi, weather_temp, traffic, distance_km,
                 transport_emissions, energy_emissions, waste_emissions, carbon_score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (1, action, accepted, hour, "Delhi", aqi, temp, traffic, distance, t_kg, e_kg, w_kg, score),
            )

        _ensure_user_weights(db, 1)


def _migrate_schema(db: sqlite3.Connection) -> None:
    def has_column(table: str, column: str) -> bool:
        cols = {row["name"] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
        return column in cols

    user_columns = {
        "preferred_transport": "TEXT NOT NULL DEFAULT 'metro'",
        "avg_distance_km": "REAL NOT NULL DEFAULT 6.0",
        "carbon_score": "REAL NOT NULL DEFAULT 0",
        "streak_days": "INTEGER NOT NULL DEFAULT 0",
        "last_action_date": "TEXT",
        "created_at": "TEXT",
    }
    for name, definition in user_columns.items():
        if not has_column("users", name):
            db.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")

    activity_columns = {
        "accepted": "INTEGER NOT NULL DEFAULT 0",
        "location_name": "TEXT NOT NULL DEFAULT 'Unknown'",
        "traffic": "REAL NOT NULL DEFAULT 50",
        "distance_km": "REAL NOT NULL DEFAULT 6",
        "transport_emissions": "REAL NOT NULL DEFAULT 0",
        "energy_emissions": "REAL NOT NULL DEFAULT 0",
        "waste_emissions": "REAL NOT NULL DEFAULT 0",
        "carbon_score": "REAL NOT NULL DEFAULT 0",
    }
    for name, definition in activity_columns.items():
        if not has_column("user_activity", name):
            db.execute(f"ALTER TABLE user_activity ADD COLUMN {name} {definition}")

    recommendation_columns = {
        "top_action": "TEXT",
        "ranked_actions_json": "TEXT",
        "confidence": "REAL",
        "estimated_co2_reduction": "REAL",
        "model_name": "TEXT",
        "context_aqi": "REAL",
        "context_temp": "REAL",
        "context_traffic": "REAL",
        "context_distance": "REAL",
    }
    for name, definition in recommendation_columns.items():
        if not has_column("recommendations", name):
            db.execute(f"ALTER TABLE recommendations ADD COLUMN {name} {definition}")

    environment_columns = {
        "aqi_label": "TEXT NOT NULL DEFAULT 'Moderate'",
        "aqi_source": "TEXT NOT NULL DEFAULT 'WAQI'",
        "temperature_source": "TEXT NOT NULL DEFAULT 'OpenWeather'",
    }
    for name, definition in environment_columns.items():
        if not has_column("environment_cache", name):
            db.execute(f"ALTER TABLE environment_cache ADD COLUMN {name} {definition}")

def _ensure_user_weights(db: sqlite3.Connection, user_id: int) -> None:
    defaults = {"metro": 1.2, "bike": 1.1, "walk": 1.05, "cab": 0.7, "avoid_travel": 1.0}
    for action, weight in defaults.items():
        db.execute(
            "INSERT OR IGNORE INTO model_weights (user_id, action, weight) VALUES (?, ?, ?)",
            (user_id, action, weight),
        )
