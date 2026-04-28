import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

const initial = {
  transport: "",
  effort: "",
  time: "",
  goal: "",
};

export function UserPreferencesForm({ userId, initialValue, onSave, saving }) {
  const [form, setForm] = useState(() => ({
    ...initial,
    ...(initialValue || {}),
    goal: initialValue?.goal || "",
  }));
  const [error, setError] = useState("");

  const invalid = useMemo(() => !form.transport || !form.effort || !form.time, [form]);

  async function submit(event) {
    event.preventDefault();
    if (invalid) {
      setError("Please fill all required fields.");
      return;
    }
    setError("");
    try {
      await onSave({
        user_id: userId,
        transport: form.transport,
        effort: form.effort,
        time: form.time,
        goal: form.goal || null,
      });
    } catch (requestError) {
      setError(String(requestError?.message || requestError));
    }
  }

  return (
    <form className="prefs-form card" onSubmit={submit} data-reveal>
      <div className="card-head">
        <h3>User Preferences</h3>
      </div>
      <label>
        Transport*
        <select value={form.transport} onChange={(event) => setForm((v) => ({ ...v, transport: event.target.value }))}>
          <option value="">Select</option>
          <option value="car">car</option>
          <option value="bike">bike</option>
          <option value="public_transport">public_transport</option>
          <option value="walk_cycle">walk_cycle</option>
        </select>
      </label>
      <label>
        Effort willingness*
        <select value={form.effort} onChange={(event) => setForm((v) => ({ ...v, effort: event.target.value }))}>
          <option value="">Select</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </label>
      <label>
        Time availability*
        <select value={form.time} onChange={(event) => setForm((v) => ({ ...v, time: event.target.value }))}>
          <option value="">Select</option>
          <option value="busy">busy</option>
          <option value="flexible">flexible</option>
        </select>
      </label>
      <label>
        Goal
        <select value={form.goal} onChange={(event) => setForm((v) => ({ ...v, goal: event.target.value }))}>
          <option value="">None</option>
          <option value="reduce_carbon">reduce_carbon</option>
          <option value="save_money">save_money</option>
          <option value="fitness">fitness</option>
        </select>
      </label>
      <button type="submit" disabled={saving || invalid}>
        {saving ? <Loader2 size={15} /> : "Save Preferences"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
