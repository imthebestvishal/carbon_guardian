import sqlite3

conn = sqlite3.connect("carbon_guardian.db")
cur = conn.cursor()

# Show what's there
cur.execute("SELECT city, local_area, lat, lon, created_at FROM environment_cache ORDER BY created_at DESC LIMIT 10")
rows = cur.fetchall()
print("Current cache rows:")
for r in rows:
    print(" ", r)

# Delete all stale rows where local_area is wrong (old data before fix)
cur.execute("DELETE FROM environment_cache WHERE local_area = 'Connaught Place'")
print(f"\nDeleted {cur.rowcount} stale 'Connaught Place' rows.")

# Also delete all rows older than 1 hour
cur.execute("DELETE FROM environment_cache WHERE datetime(created_at) < datetime('now', '-1 hour')")
print(f"Deleted {cur.rowcount} rows older than 1 hour.")

conn.commit()
conn.close()
print("Done. Cache is clean.")
