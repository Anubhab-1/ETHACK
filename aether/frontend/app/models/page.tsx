"use client";

import { useEffect, useState } from "react";
import { api, type TrainingJobResponse } from "@/lib/api";

export default function ModelsPage() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<TrainingJobResponse | null>(null);
  const [trainStatus, setTrainStatus] = useState<string | null>(null);

  const refreshModels = async () => {
    try {
      const r = await api.models();
      setModels(r.models || []);
    } catch (e) {
      console.error("Failed to fetch models:", e);
    }
  };

  useEffect(() => {
    setLoading(true);
    refreshModels().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!job?.job_id) return;

    const poll = async () => {
      try {
        const next = await api.trainingJob(job.job_id);
        setJob(next);
        setTrainStatus(`${next.status} — ${next.message}`);
        if (next.status === "completed" || next.status === "failed") {
          await refreshModels();
        }
      } catch (e) {
        console.error("Failed to poll job:", e);
      }
    };

    poll();
    const interval = window.setInterval(poll, 1500);
    return () => window.clearInterval(interval);
  }, [job?.job_id]);

  const retrain = async (city: string) => {
    setTrainStatus(`Queueing training for ${city}...`);
    try {
      const nextJob = await api.trainModels(city);
      setJob(nextJob);
      setTrainStatus(`${nextJob.status} — ${nextJob.message}`);
    } catch (e) {
      console.error(e);
      setTrainStatus(`Failed to start training for ${city}`);
    }
  };

  const cities = Array.from(new Set(models.map((m) => m.city).filter(Boolean))).length
    ? Array.from(new Set(models.map((m) => m.city).filter(Boolean)))
    : ["Kolkata", "Delhi", "Mumbai"];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Model Artifacts</h1>
      <div className="mb-4">
        <p className="text-sm text-gray-400">This page lists saved model artifacts and basic metrics. Use the retrain button to trigger a background training job.</p>
      </div>

      <div className="mb-6">
        <div className="flex gap-2">
          {cities.map((c) => (
            <button
              key={c}
              onClick={() => retrain(c)}
              className="px-3 py-1 rounded bg-orange-500 text-white text-sm disabled:opacity-60"
              disabled={Boolean(job?.job_id && job.status !== "completed" && job.status !== "failed")}
            >
              Retrain {c}
            </button>
          ))}
        </div>
        {trainStatus && <p className="text-sm text-gray-300 mt-2">{trainStatus}</p>}
        {job?.job_id && (
          <p className="text-xs text-gray-500 mt-1">Job ID: {job.job_id}</p>
        )}
      </div>

      <div className="bg-gray-900 rounded-lg p-4">
        {loading ? (
          <p className="text-gray-400">Loading models…</p>
        ) : models.length === 0 ? (
          <p className="text-gray-500">No model artifacts found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-800">
                <th className="py-2">Filename</th>
                <th className="py-2">Size</th>
                <th className="py-2">Modified</th>
                <th className="py-2">City / Info</th>
                <th className="py-2">Status</th>
                <th className="py-2">Metrics</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.filename} className="border-b border-gray-800">
                  <td className="py-2">{m.filename}</td>
                  <td className="py-2">{(m.size_bytes / 1024).toFixed(1)} KB</td>
                  <td className="py-2">{new Date(m.modified_at).toLocaleString()}</td>
                  <td className="py-2">{m.city || m.model || "-"}</td>
                  <td className="py-2">
                    <span className={`text-xs font-medium ${m.metrics?.status === "trained" ? "text-green-400" : m.metrics?.status === "insufficient_data" ? "text-yellow-400" : "text-gray-400"}`}>
                      {m.metrics?.status ? String(m.metrics.status).replace(/_/g, " ") : "available"}
                    </span>
                  </td>
                  <td className="py-2">
                    {m.metrics ? (
                      <div className="text-xs text-gray-300">
                        {Object.entries(m.metrics).filter(([k]) => !["city", "horizon", "status", "message", "model_file", "saved_at"].includes(k)).map(([k, v]) => (
                          <div key={k}><strong>{k}:</strong> {String(v)}</div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
