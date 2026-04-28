import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function WeeklyChart({ data = [], loading = false }) {
  return (
    <div className="card weekly-card" data-reveal>
      <div className="card-head">
        <h3>Your Weekly CO2 Trend</h3>
      </div>
      <div className="chart-unit">kg CO2e</div>
      <div className="chart-shell">
        {loading ? (
          <div className="chart-loading">Loading chart...</div>
        ) : data.length === 0 ? (
          <div className="chart-loading">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={data} margin={{ top: 12, right: 18, left: 2, bottom: 2 }}>
              <XAxis dataKey="day" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #d7e2dc",
                  boxShadow: "0 10px 28px rgba(0,0,0,.12)",
                }}
                formatter={(value) => [`${value} kg CO2e`, "Emissions"]}
              />
              <Line
                type="monotone"
                dataKey="co2"
                stroke="#149238"
                strokeWidth={3}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                animationDuration={700}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

