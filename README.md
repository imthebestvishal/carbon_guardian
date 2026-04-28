# Carbon Guardian AI

Production-style full-stack app with real geolocation/environment lookup, adaptive recommendation learning, interactive charting, and complete action handling.

## Stack

- Frontend: React + Vite + Tailwind + Recharts
- Backend: FastAPI
- Database: SQLite local (migration-ready schema for PostgreSQL)
- ML: TensorFlow Recommenders with weighted fallback
- External data: Browser geolocation + OpenWeather/Open-Meteo + reverse geocoding

## Implemented Endpoints

- `POST /api/user`
- `GET /api/user/{id}`
- `GET /api/environment?lat=...&lon=...`
- `GET /api/environment?city=...`
- `GET /api/search?query=...`
- `GET /api/recommendation/{user_id}`
- `POST /api/action`
- `GET /api/history/{user_id}`
- `GET /api/carbon-score/{user_id}`
- `POST /api/simulate`
- `POST /api/redeem`
- `GET /api/leaderboard`

## Example Responses

`GET /api/environment?lat=28.61&lon=77.20`

```json
{
  "city": "Delhi",
  "area": "Connaught Place",
  "aqi": 143.0,
  "temperature": 32.4,
  "source": "openweather"
}
```

`GET /api/carbon-score/1`

```json
{
  "score": 2.731,
  "breakdown": {
    "transport": 3.018,
    "energy": 2.124,
    "waste": 0.762
  }
}
```

`POST /api/simulate`

```json
{
  "co2_saved": 345709500.0,
  "aqi_improvement": 35.0,
  "temperature_reduction": 1.2
}
```

## Local Run

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Use `http://127.0.0.1:5173` for the React app and `http://127.0.0.1:8000/docs` for backend docs.
