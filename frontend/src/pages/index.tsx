import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";
import {
  uploadCsv,
  PredictResponse,
  PurchaseRow,
  RiskFlag
} from "../lib/api";

type AuthState = "checking" | "loggedOut" | "loggedIn";
type SubscriptionTier = "free" | "pro";

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
  avgProb: number;
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildHeatmap(rows: PurchaseRow[]): HeatmapCell[] {
  const matrix: { [key: string]: { count: number; sumProb: number } } = {};

  rows.forEach((row) => {
    if (!row.timestamp) return;
    const date = new Date(row.timestamp);
    if (isNaN(date.getTime())) return;

    const day = date.getDay();
    const hour = date.getHours();
    const key = `${day}-${hour}`;
    if (!matrix[key]) {
      matrix[key] = { count: 0, sumProb: 0 };
    }
    matrix[key].count += 1;
    matrix[key].sumProb += row.probability;
  });

  return Object.entries(matrix).map(([key, value]) => {
    const [dayStr, hourStr] = key.split("-");
    const day = parseInt(dayStr, 10);
    const hour = parseInt(hourStr, 10);
    return {
      day,
      hour,
      count: value.count,
      avgProb: value.sumProb / value.count
    };
  });
}

function probabilityHistogram(rows: PurchaseRow[]) {
  const bins = Array.from({ length: 10 }, (_, i) => ({
    bin: `${(i * 0.1).toFixed(1)}-${((i + 1) * 0.1).toFixed(1)}`,
    count: 0
  }));

  rows.forEach((row) => {
    const p = Math.min(Math.max(row.probability, 0), 0.999);
    const index = Math.floor(p * 10);
    bins[index].count += 1;
  });

  return bins;
}

function topSuspiciousUsers(rows: PurchaseRow[]) {
  const byUser: Record<
    string,
    { maxProb: number; count: number; reds: number }
  > = {};

  rows.forEach((row) => {
    const key = row.user_id || row.raw["user_id"] || "unknown";
    const userId = String(key);
    if (!byUser[userId]) {
      byUser[userId] = { maxProb: 0, count: 0, reds: 0 };
    }
    const bucket = byUser[userId];
    bucket.count += 1;
    bucket.maxProb = Math.max(bucket.maxProb, row.probability);
    if (row.flag === "red") {
      bucket.reds += 1;
    }
  });

  return Object.entries(byUser)
    .map(([userId, agg]) => ({
      userId,
      maxProb: agg.maxProb,
      reds: agg.reds,
      count: agg.count
    }))
    .sort((a, b) => b.maxProb - a.maxProb)
    .slice(0, 10);
}

function flagColor(flag: RiskFlag): string {
  if (flag === "green") return "bg-emerald-500";
  if (flag === "yellow") return "bg-amber-500";
  return "bg-rose-600";
}

function flagTextColor(flag: RiskFlag): string {
  if (flag === "green") return "text-emerald-100";
  if (flag === "yellow") return "text-amber-100";
  return "text-rose-100";
}

export default function HomePage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [subscription, setSubscription] = useState<SubscriptionTier>("free");
  const [showCheckout, setShowCheckout] = useState(false);

  const [darkMode, setDarkMode] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedRow, setSelectedRow] = useState<PurchaseRow | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loggedIn = window.localStorage.getItem("scalpshield_logged_in");
    const tier =
      (window.localStorage.getItem(
        "scalpshield_subscription"
      ) as SubscriptionTier) || "free";
    const dark = window.localStorage.getItem("scalpshield_darkmode") === "true";

    setAuthState(loggedIn === "true" ? "loggedIn" : "loggedOut");
    setSubscription(tier);
    setDarkMode(dark);

    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (typeof window === "undefined") return;
    window.localStorage.setItem("scalpshield_logged_in", "true");
    setAuthState("loggedIn");
  };

  const handleLogout = () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("scalpshield_logged_in");
    window.localStorage.removeItem("scalpshield_subscription");
    setAuthState("loggedOut");
    setSubscription("free");
    setResult(null);
  };

  const toggleDarkMode = () => {
    if (typeof window === "undefined") return;
    const next = !darkMode;
    setDarkMode(next);
    window.localStorage.setItem("scalpshield_darkmode", String(next));
    if (next) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleRunModel = async () => {
    if (!selectedFile) {
      setError("Please select a CSV file first.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await uploadCsv(selectedFile);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to run model.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const histogramData = useMemo(
    () => (result ? probabilityHistogram(result.rows) : []),
    [result]
  );

  const topUsers = useMemo(
    () => (result ? topSuspiciousUsers(result.rows) : []),
    [result]
  );

  const heatmapData = useMemo(
    () => (result ? buildHeatmap(result.rows) : []),
    [result]
  );

  const maxHeatCount = useMemo(
    () => heatmapData.reduce((max, cell) => Math.max(max, cell.count), 0),
    [heatmapData]
  );

  const handleSubscribed = () => {
    setSubscription("pro");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("scalpshield_subscription", "pro");
    }
    setShowCheckout(false);
  };

  if (authState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
        <div className="text-lg font-semibold">Loading ScalpShield...</div>
      </div>
    );
  }

  if (authState === "loggedOut") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-8 shadow-xl">

<div className="flex items-center gap-3 mb-2">
  <div className="relative h-8 w-8">
    <Image
      src="/scalpshield-logo.png"
      alt="ScalpShield logo"
      fill
      className="object-contain"
      priority
    />
  </div>
  <h1 className="text-2xl font-bold text-white">ScalpShield</h1>
</div>
          <p className="text-sm text-slate-300 mb-6">
            Local demo SaaS for detecting suspicious ticket purchases. Use any
            email and password to sign in.
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                defaultValue="demo@scalpshield.ai"
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">
                Password
              </label>
              <input
                type="password"
                defaultValue="password123"
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-2 text-sm transition"
            >
              Sign in to dashboard
            </button>
            <p className="text-xs text-slate-400 mt-2">
              This is a local-only demo. Authentication and billing are fully
              simulated.
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-950 text-gray-900 dark:text-gray-100">
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
<div className="flex items-center gap-3">
  <div className="relative h-8 w-8">
    <Image
      src="/scalpshield-logo.png"
      alt="ScalpShield logo"
      fill
      className="object-contain"
      priority
    />
  </div>
  <div>
    <div className="font-semibold text-white text-sm">
      ScalpShield
    </div>
    <div className="text-xs text-slate-400">
      Local demo • {subscription === "pro" ? "Pro" : "Free"} tier
    </div>
  </div>
</div>          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              {darkMode ? "Light mode" : "Dark mode"}
            </button>
            {subscription === "free" && (
              <button
                onClick={() => setShowCheckout(true)}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1"
              >
                Upgrade to Pro
              </button>
            )}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Upload panel */}
        <section className="grid md:grid-cols-[1.4fr,1fr] gap-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border border-dashed border-slate-400 dark:border-slate-700 rounded-xl p-6 bg-white dark:bg-slate-900 flex flex-col justify-between"
          >
            <div>
              <h2 className="text-lg font-semibold mb-2">
                Upload purchase activity CSV
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Drag and drop a CSV file or choose one from your computer. Use
                the included <span className="font-mono text-xs">sample_data.csv</span> to get started.
              </p>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center justify-center rounded-md border border-slate-400 dark:border-slate-600 px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  Choose file
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
                {selectedFile && (
                  <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-xs">
                    {selectedFile.name}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Required columns: minutes_since_release, tickets, total_amount,
                ip_purchase_count_24h, user_purchase_count_30d,
                user_account_age_days, same_card_purchase_count_24h
              </div>
              <button
                onClick={handleRunModel}
                disabled={loading}
                className="inline-flex items-center rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm px-4 py-2"
              >
                {loading ? "Running model..." : "Run model"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-semibold mb-3">Risk summary</h3>
            {result ? (
              <div className="grid grid-cols-3 gap-3">
                <SummaryCard
                  label="Total"
                  value={result.summary.count_total}
                  description="Rows scored"
                />
                <SummaryCard
                  label="Green"
                  value={result.summary.count_green}
                  description="Low risk"
                  color="green"
                />
                <SummaryCard
                  label="Yellow"
                  value={result.summary.count_yellow}
                  description="Medium risk"
                  color="yellow"
                />
                <SummaryCard
                  label="Red"
                  value={result.summary.count_red}
                  description="High risk"
                  color="red"
                  className="col-span-3 sm:col-span-1"
                />
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Run the model to see risk summary.
              </p>
            )}
            {error && (
              <p className="mt-3 text-xs text-rose-400">
                Error: {error}
              </p>
            )}
          </div>
        </section>

        {/* Charts */}
        <section className="grid lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex flex-col">
            <h3 className="text-sm font-semibold mb-3">
              Suspicion probability histogram
            </h3>
            {result && result.rows.length > 0 ? (
              <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={histogramData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="bin" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <PlaceholderChartHint />
            )}
          </div>

          <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex flex-col">
            <h3 className="text-sm font-semibold mb-3">
              Top suspicious users
            </h3>
            {result && result.rows.length > 0 ? (
              <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topUsers}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="userId"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis domain={[0, 1]} />
                    <Tooltip />
                    <Bar dataKey="maxProb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <PlaceholderChartHint />
            )}
          </div>

          <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">
                Activity heatmap (hour × weekday)
              </h3>
              {subscription === "free" && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-800 text-slate-200">
                  Pro feature
                </span>
              )}
            </div>
            {subscription === "free" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-xs text-slate-400">
                <p className="mb-2">
                  Upgrade to <span className="font-semibold">Pro</span> to
                  unlock the activity heatmap.
                </p>
                <button
                  onClick={() => setShowCheckout(true)}
                  className="inline-flex items-center rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1"
                >
                  Upgrade to Pro
                </button>
              </div>
            )}
            {subscription === "pro" && result && result.rows.length > 0 ? (
              <div className="mt-2 space-y-1">
                <div className="grid grid-cols-[40px_repeat(24,1fr)] gap-0.5 text-[9px] text-slate-400">
                  <div />
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={hour} className="text-center">
                      {hour}
                    </div>
                  ))}
                </div>
                <div className="space-y-0.5">
                  {weekdayLabels.map((label, day) => (
                    <div
                      key={day}
                      className="grid grid-cols-[40px_repeat(24,1fr)] gap-0.5"
                    >
                      <div className="text-[10px] text-slate-400 flex items-center">
                        {label}
                      </div>
                      {Array.from({ length: 24 }, (_, hour) => {
                        const cell = heatmapData.find(
                          (c) => c.day === day && c.hour === hour
                        );
                        const intensity =
                          cell && maxHeatCount > 0
                            ? cell.count / maxHeatCount
                            : 0;
                        const bgOpacity =
                          intensity === 0 ? 0 : 0.2 + 0.6 * intensity;
                        return (
                          <div
                            key={hour}
                            title={
                              cell
                                ? `${cell.count} purchases, avg prob ${cell.avgProb.toFixed(
                                    2
                                  )}`
                                : "No activity"
                            }
                            className="h-4 rounded-sm bg-emerald-500 transition-opacity"
                            style={{ opacity: bgOpacity }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : subscription === "pro" ? (
              <PlaceholderChartHint />
            ) : null}
          </div>
        </section>

        {/* Table */}
        <section className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Scored purchases</h3>
            {result && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Click a row to view explanations and raw fields.
              </span>
            )}
          </div>
          {result && result.rows.length > 0 ? (
            <div className="overflow-auto max-h-[420px] text-xs">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 z-10">
                  <tr className="text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      #
                    </th>
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      Flag
                    </th>
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      Prob
                    </th>
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      User
                    </th>
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      Event
                    </th>
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      Tickets
                    </th>
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      Total
                    </th>
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      IP 24h
                    </th>
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      Card 24h
                    </th>
                    <th className="text-left px-2 py-2 border-b border-slate-700">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr
                      key={row.row_index}
                      onClick={() => setSelectedRow(row)}
                      className="border-b border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="px-2 py-1 text-slate-400">
                        {row.row_index}
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${flagColor(
                            row.flag
                          )} ${flagTextColor(row.flag)}`}
                        >
                          {row.flag.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        {row.probability.toFixed(2)}
                      </td>
                      <td className="px-2 py-1">
                        {row.user_id || row.raw["user_id"] || "—"}
                      </td>
                      <td className="px-2 py-1">
                        {row.event_id || row.raw["event_id"] || "—"}
                      </td>
                      <td className="px-2 py-1">
                        {row.raw["tickets"] ?? "—"}
                      </td>
                      <td className="px-2 py-1">
                        {row.raw["total_amount"] ?? "—"}
                      </td>
                      <td className="px-2 py-1">
                        {row.raw["ip_purchase_count_24h"] ?? "—"}
                      </td>
                      <td className="px-2 py-1">
                        {row.raw["same_card_purchase_count_24h"] ?? "—"}
                      </td>
                      <td className="px-2 py-1">
                        {row.timestamp || row.raw["timestamp"] || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No data yet. Upload a CSV and run the model to see scored
              purchases.
            </p>
          )}
        </section>
      </main>

      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onSubscribed={handleSubscribed}
        />
      )}

      {selectedRow && (
        <RowDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
  description: string;
  color?: "green" | "yellow" | "red";
  className?: string;
}

function SummaryCard({
  label,
  value,
  description,
  color,
  className
}: SummaryCardProps) {
  let pillColor =
    "bg-slate-800 text-slate-100 border border-slate-600";
  if (color === "green") {
    pillColor = "bg-emerald-500/20 text-emerald-100 border border-emerald-500/40";
  } else if (color === "yellow") {
    pillColor = "bg-amber-500/20 text-amber-100 border border-amber-500/40";
  } else if (color === "red") {
    pillColor = "bg-rose-500/20 text-rose-100 border border-rose-500/40";
  }

  return (
    <div
      className={`rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 flex flex-col gap-1 ${className || ""}`}
    >
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-xl font-semibold text-white">{value}</div>
      <div
        className={`inline-flex items-center self-start px-2 py-0.5 rounded-full text-[10px] ${pillColor}`}
      >
        {description}
      </div>
    </div>
  );
}

function PlaceholderChartHint() {
  return (
    <div className="flex-1 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
      Run the model on a CSV to populate this chart.
    </div>
  );
}

interface CheckoutModalProps {
  onClose: () => void;
  onSubscribed: () => void;
}

function CheckoutModal({ onClose, onSubscribed }: CheckoutModalProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProcessing(true);
    setTimeout(() => {
      onSubscribed();
      setProcessing(false);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl bg-slate-950 border border-slate-800 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">
          Upgrade to ScalpShield Pro
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          This checkout is fully simulated. Use any card details to continue.
          No real payments are processed.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-300 mb-1">
              Card number
            </label>
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="4242 4242 4242 4242"
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Expiration
              </label>
              <input
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                placeholder="12/29"
                className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                CVC
              </label>
              <input
                value={cvc}
                onChange={(e) => setCvc(e.target.value)}
                placeholder="123"
                className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">
              Cardholder name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Demo User"
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing}
              className="inline-flex items-center rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs px-4 py-2"
            >
              {processing ? "Activating Pro..." : "Start Pro (simulated)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RowDetailDrawerProps {
  row: PurchaseRow;
  onClose: () => void;
}

function RowDetailDrawer({ row, onClose }: RowDetailDrawerProps) {
  const entries = Object.entries(row.raw || {});

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/60">
      <div className="w-full max-w-md h-full bg-slate-950 border-l border-slate-800 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-white">
              Row {row.row_index}
            </div>
            <div className="text-xs text-slate-400">
              User {row.user_id || row.raw["user_id"] || "—"} • Event{" "}
              {row.event_id || row.raw["event_id"] || "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-100"
          >
            Close
          </button>
        </div>
        <div className="mb-3">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${flagColor(
              row.flag
            )} ${flagTextColor(row.flag)}`}
          >
            {row.flag.toUpperCase()}
          </span>
          <span className="ml-2 text-xs text-slate-300">
            Probability: {row.probability.toFixed(2)}
          </span>
        </div>
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-slate-200 mb-1">
            Explanations
          </h4>
          <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1 max-h-32 overflow-auto">
            {row.explanations.map((exp, idx) => (
              <li key={idx}>{exp}</li>
            ))}
          </ul>
        </div>
        <div className="flex-1 min-h-0">
          <h4 className="text-xs font-semibold text-slate-200 mb-1">
            Raw fields
          </h4>
          <div className="border border-slate-700 rounded-lg p-2 max-h-full overflow-auto text-[11px]">
            {entries.map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between gap-2 border-b border-slate-800 last:border-b-0 py-1"
              >
                <span className="text-slate-400">{key}</span>
                <span className="text-slate-200 max-w-[60%] text-right truncate">
                  {value === null || value === undefined ? "—" : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
