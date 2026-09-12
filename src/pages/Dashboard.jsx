import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../services/api.js";
import StatsCard from "../components/StatsCard.jsx";
import SearchBar from "../components/SearchBar.jsx";

const TERMINAL = new Set(["SUCCEEDED", "PARTIAL", "FAILED"]);

function Stage({ label, state }) {
  const tone =
    state === "SUCCEEDED" || state === "done"
      ? "bg-green-100 text-green-800 border border-green-300"
      : state === "FAILED"
        ? "bg-red-100 text-red-800 border border-red-300"
        : state === "PARTIAL"
          ? "bg-amber-100 text-amber-800 border border-amber-300"
          : state === "running"
            ? "bg-blue-100 text-blue-800 border border-blue-300 animate-pulse"
            : "bg-gray-100 text-gray-600 border border-gray-200";
  return (
    <span className={`rounded px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label}: {state || "pending"}
    </span>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [datasetType, setDatasetType] = useState("FIR");
  const [stages, setStages] = useState({});
  const [pipelineError, setPipelineError] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setStatsError("");
    try {
      const [entities, anomalies, pagerank, communities, degree] = await Promise.all([
        api.entities({ page: 1, page_size: 1 }),
        api.anomalies({ page: 1, page_size: 1 }),
        api.pagerank({ page: 1, page_size: 5 }).catch(() => ({ items: [], pagination: { total: 0 } })),
        api.communities({ page: 1, page_size: 100 }).catch(() => ({ items: [] })),
        api.degree({ page: 1, page_size: 100 }).catch(() => ({ items: [] })),
      ]);
      const relationshipCount = degree.items
        ? Math.round(degree.items.reduce((sum, row) => sum + (row.degree || 0), 0) / 2)
        : null;
      setStats({
        entities: entities.pagination?.total ?? 0,
        relationships: relationshipCount,
        anomalies: anomalies.pagination?.total ?? 0,
        communities: new Set((communities.items || []).map((row) => row.community_id)).size,
        top: pagerank.items || [],
      });
    } catch (error) {
      setStatsError(error instanceof ApiError ? error.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleSearch = useCallback(async (query) => {
    if (!query) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await api.search(query, { page: 1, page_size: 10 });
      setSearchResults(res.items || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  async function pollJob(jobId) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const job = await api.job(jobId);
      const status = job.status || job.result?.status;
      if (status && TERMINAL.has(status)) return job;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new ApiError(0, "TIMEOUT", "Processing did not finish in time.");
  }

  async function runPipeline(event) {
    event.preventDefault();
    if (!file) {
      setPipelineError("Choose a file first.");
      return;
    }
    setBusy(true);
    setPipelineError("");
    setStages({ upload: "running" });
    try {
      const upload = await api.upload(file, datasetType);
      setStages({ upload: "done", process: "running" });
      const proc = await api.process(upload.upload_id);
      const job = await pollJob(proc.job_id);
      const finalStatus = job.status || job.result?.status;
      setStages((prev) => ({ ...prev, process: finalStatus }));
      if (finalStatus !== "SUCCEEDED" && finalStatus !== "PARTIAL") {
        throw new ApiError(0, "PROCESS_FAILED", `Processing ended as ${finalStatus}.`);
      }
      setStages((prev) => ({ ...prev, build: "running" }));
      const build = await api.buildGraph(upload.upload_id);
      setStages((prev) => ({ ...prev, build: build.status }));
      if (build.status !== "SUCCEEDED") {
        throw new ApiError(0, "BUILD_FAILED", "Graph build did not succeed.");
      }
      setStages((prev) => ({ ...prev, analytics: "running" }));
      await api.runAnalytics(upload.upload_id);
      setStages((prev) => ({ ...prev, analytics: "done" }));
      await loadStats();
    } catch (error) {
      setStages((prev) => ({ ...prev, failed: true }));
      setPipelineError(error instanceof ApiError ? error.message : "Pipeline failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intelligence Dashboard</h1>
          <p className="text-sm text-gray-500">Cross-source criminal network analytics, graph triage, and behavioral anomaly signals.</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-2">Universal Search</h2>
        <SearchBar onSearch={handleSearch} loading={searchLoading} />
        {searchResults.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100 rounded border border-gray-200 bg-gray-50">
            {searchResults.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-2.5 text-sm hover:bg-white">
                <div>
                  <Link to={`/entities/${encodeURIComponent(item.id)}`} className="font-semibold text-blue-700 hover:underline">
                    {item.name}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-gray-500">({item.id})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">{item.type}</span>
                  <Link to={`/investigation/${encodeURIComponent(item.id)}`} className="text-xs text-indigo-600 hover:underline">
                    Investigation &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading dashboard…</p>
      ) : statsError ? (
        <p className="text-sm text-red-600">{statsError}</p>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatsCard label="Entities" value={stats.entities} sub="Resolved canonical entities" />
            <StatsCard label="Relationships (est.)" value={stats.relationships ?? "—"} sub="Graph edge connections" />
            <StatsCard label="Anomalies" value={stats.anomalies} sub="Elevated behavioral signals" />
            <StatsCard label="Communities" value={stats.communities} sub="Detected graph clusters" />
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900">Top Structural Hubs (PageRank Centrality)</h2>
            <p className="text-xs text-gray-500 mb-3">Analytical structural signal — not evidence of criminality.</p>
            {stats.top.length === 0 ? (
              <p className="text-sm text-gray-500">No analytics calculated yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {stats.top.map((row) => (
                  <li key={row.entity_id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Link className="font-medium text-blue-700 hover:underline" to={`/investigation/${encodeURIComponent(row.entity_id)}`}>
                        {row.entity_id}
                      </Link>
                    </div>
                    <span className="rounded bg-blue-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-blue-700">
                      PageRank: {typeof row.pagerank === "number" ? row.pagerank.toFixed(4) : row.pagerank}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">Ingest Evidence (Upload → Process → Graph → Analytics)</h2>
        <p className="text-xs text-gray-500 mb-4">Upload synthetic or sanitized FIR, CDR, Transaction, Vehicle, or Location data files.</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={runPipeline}>
          <label className="text-sm">
            <span className="block font-medium text-gray-700 mb-1">File (CSV / JSON / TXT)</span>
            <input
              className="block text-sm text-gray-700 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold hover:file:bg-gray-200"
              type="file"
              accept=".csv,.json,.txt"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <label className="text-sm">
            <span className="block font-medium text-gray-700 mb-1">Dataset Type</span>
            <select
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
              value={datasetType}
              onChange={(event) => setDatasetType(event.target.value)}
            >
              {["FIR", "CDR", "TRANSACTION", "VEHICLE", "LOCATION"].map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <button
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800 disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            {busy ? "Running Pipeline…" : "Upload & Process Pipeline"}
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          <Stage label="Upload" state={stages.upload} />
          <Stage label="Process" state={stages.process} />
          <Stage label="Graph Build" state={stages.build} />
          <Stage label="Analytics" state={stages.analytics} />
        </div>
        {pipelineError ? <p className="mt-3 text-sm text-red-600">{pipelineError}</p> : null}
      </div>
    </div>
  );
}
