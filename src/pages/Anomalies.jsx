import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../services/api.js";
import AnomalyCard from "../components/AnomalyCard.jsx";

export default function Anomalies() {
  const [severity, setSeverity] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.anomalies({
        page: 1,
        page_size: 50,
        ...(severity ? { severity } : {}),
      });
      setItems(data.items || []);
      setTotal(data.pagination?.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [severity]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Behavioral Anomaly Dashboard</h1>
          <p className="text-sm text-gray-500">
            Unusual call frequencies, night patterns, outlier financial transactions, or sudden location shifts.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span className="font-medium">Filter Severity:</span>
          <select
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          >
            <option value="">All Severities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <span className="font-semibold">Analytical Disclaimer:</span> Anomaly scores are behavioral triage indicators computed from multi-dimensional feature variance, not proof of wrongdoing or criminality.
      </div>

      {loading ? <p className="text-sm text-gray-500">Loading anomalies…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No anomaly items found. Ingest datasets or run graph analytics.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <AnomalyCard key={item.entity_id} item={item} />
        ))}
      </div>
    </div>
  );
}
