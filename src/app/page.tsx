"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { format, subHours } from "date-fns";
import { useLanguage } from "@/lib/i18n";
import LanguageSwitch from "@/components/LanguageSwitch";

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface DataPoint {
  t: string;
  alt_km: number;
}

interface AltitudeResponse {
  norad_id: number;
  start: string;
  end: string;
  step_seconds: number;
  points: DataPoint[];
  meta: {
    tle_source: string;
    tle_epoch: string;
    earth_radius_km: number;
  };
}

export default function Home() {
  const { t } = useLanguage();
  const [noradId, setNoradId] = useState("25544");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [stepSeconds, setStepSeconds] = useState("60");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AltitudeResponse | null>(null);

  // datetime-local の値(ローカル時刻)を、バックエンド要求の UTC ISO8601 "Z付き" に変換
  const toUTCISOString = (localDateTime: string) => {
    // localDateTime 例: "2026-01-01T12:34:56" (JST等のローカル)
    const d = new Date(localDateTime);
    if (Number.isNaN(d.getTime())) {
      throw new Error("Invalid date/time format");
    }
    return d.toISOString().replace(".000Z", "Z"); // "2026-01-01T03:34:56Z"
  };

  // Set default date values after mount to avoid hydration mismatch
  useEffect(() => {
    const now = new Date();
    // datetime-local に入れるのでローカル時刻の文字列（Zは付けない）
    setEndTime(format(now, "yyyy-MM-dd'T'HH:mm:ss"));
    setStartTime(format(subHours(now, 6), "yyyy-MM-dd'T'HH:mm:ss"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

      // ここで UTC(Z付き) に正規化して送る
      const startUTC = toUTCISOString(startTime);
      const endUTC = toUTCISOString(endTime);

      const params = new URLSearchParams({
        n: noradId,
        start: startUTC,
        end: endUTC,
        step_seconds: stepSeconds,
      });

      const response = await fetch(`${backendUrl}/altitude?${params.toString()}`);

      if (!response.ok) {
        // 可能なら json を読む（CORSやネットワークエラー時はここに来る前に throw される）
        let detail = "Failed to fetch altitude data";
        try {
          const errorData = await response.json();
          detail = errorData?.detail || detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }

      const result: AltitudeResponse = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex justify-center items-center mb-6">
            <LanguageSwitch />
          </div>
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-4">
            🛰️ {t.header.title}
          </h1>
          <p className="text-gray-300 text-lg">{t.header.subtitle}</p>
        </header>

        {/* Form Card */}
        <div className="glass-card rounded-2xl p-8 mb-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* NORAD ID */}
              <div className="form-group">
                <label htmlFor="noradId" className="form-label">
                  {t.form.noradId.label}
                </label>
                <input
                  type="number"
                  id="noradId"
                  value={noradId}
                  onChange={(e) => setNoradId(e.target.value)}
                  className="form-input"
                  required
                  min="1"
                  placeholder={t.form.noradId.placeholder}
                />
                <p className="text-gray-400 text-sm mt-1">{t.form.noradId.help}</p>
              </div>

              {/* Step Seconds */}
              <div className="form-group">
                <label htmlFor="stepSeconds" className="form-label">
                  {t.form.stepSeconds.label}
                </label>
                <input
                  type="number"
                  id="stepSeconds"
                  value={stepSeconds}
                  onChange={(e) => setStepSeconds(e.target.value)}
                  className="form-input"
                  required
                  min="1"
                  max="3600"
                  placeholder={t.form.stepSeconds.placeholder}
                />
                <p className="text-gray-400 text-sm mt-1">{t.form.stepSeconds.help}</p>
              </div>

              {/* Start Time */}
              <div className="form-group">
                <label htmlFor="startTime" className="form-label">
                  {t.form.startTime.label}
                </label>
                <input
                  type="datetime-local"
                  id="startTime"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="form-input"
                  required
                  step="1"
                />
              </div>

              {/* End Time */}
              <div className="form-group">
                <label htmlFor="endTime" className="form-label">
                  {t.form.endTime.label}
                </label>
                <input
                  type="datetime-local"
                  id="endTime"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="form-input"
                  required
                  step="1"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {t.form.calculating}
                </span>
              ) : (
                t.form.submit
              )}
            </button>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="glass-card rounded-2xl p-6 mb-8 bg-red-500/10 border border-red-500/30">
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="text-red-400 font-semibold mb-1">{t.error.title}</h3>
                <p className="text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-8">
            {/* Metadata Card */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">
                {t.results.missionDetails}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="stat-card">
                  <div className="text-gray-400 text-sm">{t.results.noradId}</div>
                  <div className="text-white text-2xl font-bold">{data.norad_id}</div>
                </div>
                <div className="stat-card">
                  <div className="text-gray-400 text-sm">{t.results.dataPoints}</div>
                  <div className="text-white text-2xl font-bold">{data.points.length}</div>
                </div>
                <div className="stat-card">
                  <div className="text-gray-400 text-sm">{t.results.tleEpoch}</div>
                  <div className="text-white text-lg font-mono">{data.meta.tle_epoch}</div>
                </div>
              </div>
            </div>

            {/* Chart Card */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                {t.results.altitudeOverTime}
              </h2>
              <div className="bg-white/5 rounded-xl p-4">
                <Plot
                  data={[
                    {
                      x: data.points.map((p) => p.t),
                      y: data.points.map((p) => p.alt_km),
                      type: "scatter",
                      mode: "lines+markers",
                      line: { color: "rgb(99, 102, 241)", width: 3 },
                      marker: { color: "rgb(99, 102, 241)", size: 4 },
                      name: "Altitude",
                    },
                  ]}
                  layout={{
                    autosize: true,
                    paper_bgcolor: "rgba(0,0,0,0)",
                    plot_bgcolor: "rgba(0,0,0,0)",
                    font: { color: "#e5e7eb", family: "system-ui, -apple-system, sans-serif" },
                    xaxis: {
                      title: t.results.timeUTC,
                      gridcolor: "rgba(255,255,255,0.1)",
                      showline: false,
                    },
                    yaxis: {
                      title: t.results.altitudeKm,
                      gridcolor: "rgba(255,255,255,0.1)",
                      showline: false,
                      autorange: true,
                      rangemode: "normal",
                    },
                    margin: { t: 20, r: 20, b: 60, l: 60 },
                    hovermode: "closest",
                  }}
                  config={{ responsive: true, displayModeBar: true, displaylogo: false }}
                  style={{ width: "100%", height: "500px" }}
                />
              </div>
            </div>

            {/* Statistics Card */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">{t.results.statistics}</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="stat-card">
                  <div className="text-gray-400 text-sm">{t.results.minAltitude}</div>
                  <div className="text-white text-xl font-bold">
                    {Math.min(...data.points.map((p) => p.alt_km)).toFixed(2)} {t.results.km}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="text-gray-400 text-sm">{t.results.maxAltitude}</div>
                  <div className="text-white text-xl font-bold">
                    {Math.max(...data.points.map((p) => p.alt_km)).toFixed(2)} {t.results.km}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="text-gray-400 text-sm">{t.results.avgAltitude}</div>
                  <div className="text-white text-xl font-bold">
                    {(data.points.reduce((sum, p) => sum + p.alt_km, 0) / data.points.length).toFixed(2)}{" "}
                    {t.results.km}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="text-gray-400 text-sm">{t.results.range}</div>
                  <div className="text-white text-xl font-bold">
                    {(Math.max(...data.points.map((p) => p.alt_km)) - Math.min(...data.points.map((p) => p.alt_km))).toFixed(2)}{" "}
                    {t.results.km}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
