from __future__ import annotations

TRANSPORT_EMISSION_KG_PER_KM = {
    "cab": 0.192,
    "car": 0.171,
    "metro": 0.035,
    "bus": 0.08,
    "train": 0.04,
    "airplane": 0.25,
    "public_transport": 0.04,
    "carpool": 0.09,
    "bike": 0.0,
    "walk": 0.0,
    "walk_cycle": 0.0,
    "avoid_travel": 0.0,
}

ENERGY_EMISSION_KG_PER_KWH = 0.708
WASTE_EMISSION_KG_PER_KG = 0.57

ACTION_POINTS = {
    "metro": 50,
    "bus": 45,
    "train": 55,
    "airplane": -40,
    "public_transport": 50,
    "carpool": 45,
    "bike": 60,
    "walk": 45,
    "walk_cycle": 60,
    "avoid_travel": 55,
    "cab": -30,
    "car": -25,
}


def carbon_breakdown(action: str, distance_km: float, energy_kwh: float, waste_kg: float) -> dict:
    normalized = action.lower().strip()
    transport = distance_km * TRANSPORT_EMISSION_KG_PER_KM.get(normalized, TRANSPORT_EMISSION_KG_PER_KM["cab"])
    energy = energy_kwh * ENERGY_EMISSION_KG_PER_KWH
    waste = waste_kg * WASTE_EMISSION_KG_PER_KG
    score = transport * 0.5 + energy * 0.3 + waste * 0.2
    return {
        "transport_emissions": round(transport, 3),
        "energy_emissions": round(energy, 3),
        "waste_emissions": round(waste, 3),
        "carbon_score": round(score, 3),
    }


def points_for_action(action: str, accepted: bool) -> int:
    if not accepted:
        return -10
    return ACTION_POINTS.get(action.lower().strip(), 20)


def co2_saving(current_action: str, eco_action: str, distance_km: float) -> float:
    baseline = TRANSPORT_EMISSION_KG_PER_KM.get(current_action.lower(), TRANSPORT_EMISSION_KG_PER_KM["cab"]) * distance_km
    improved = TRANSPORT_EMISSION_KG_PER_KM.get(eco_action.lower(), TRANSPORT_EMISSION_KG_PER_KM["metro"]) * distance_km
    return round(max(0.0, baseline - improved), 3)
