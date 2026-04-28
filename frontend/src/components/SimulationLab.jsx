export function SimulationLab({ scenario, selectedScenarioId, onScenarioChange, onRun }) {
  return (
    <div className="simulation card wide-card" id="simulation" data-reveal>
      <div>
        <h3>What If Simulation Lab</h3>
        <p>See the impact of your choices</p>
        <select value={selectedScenarioId} onChange={(event) => onScenarioChange(event.target.value)}>
          <option value="ev_adoption_30">What if 30% of users switch to EV?</option>
          <option value="metro_shift_20">What if 20% of users shift to metro?</option>
          <option value="urban_trees_100k">What if commuting distance drops citywide?</option>
        </select>
        <button onClick={onRun}>Run Simulation</button>
      </div>
      <div className="sim-results">
        <span>Potential Impact (1 Year)</span>
        <div>
          <b>{(scenario.co2_reduced_kg / 1000000).toFixed(1)} <small>Million kg</small></b>
          <p>CO2 Reduced</p>
        </div>
        <div>
          <b>{scenario.aqi_improvement_percent}%</b>
          <p>AQI Improvement</p>
        </div>
        <div>
          <b>{scenario.temp_reduction_c} C</b>
          <p>Temp Reduction</p>
        </div>
      </div>
    </div>
  );
}

