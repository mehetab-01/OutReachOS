import { useCallback, useEffect, useRef, useState } from "react";
import {
  Server, Rocket, Send, Download, CheckCircle2, Info,
  RefreshCw, Square, Trash2, Plus, Clock, BarChart2, Zap,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useApp } from "../context/AppContext";
import {
  listBatches, createBatches, sendBatch, stopBatch,
  getBatchStatus, deleteBatch, getSendStats, getSendLog, sendAllBatches,
} from "../lib/api";
import { exportSendLogCSV, formatTime } from "../lib/utils";
import { useToast } from "../components/ui/use-toast";

const BATCH_COOLDOWN_MS = 10 * 60 * 1000; // 10 min recommended between batches

function StatPill({ label, value, sub, color = "text-gray-800", bg = "bg-gray-50" }) {
  return (
    <div className={`${bg} rounded-xl p-4 flex flex-col gap-1`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

function BatchCard({ batch, smtp, onSent, onStop, onDelete, cooldownUntil }) {
  const [sending, setSending] = useState(batch.status === "sending");
  const [current, setCurrent] = useState(batch);
  const pollRef = useRef(null);
  const { toast } = useToast();

  // Countdown timer state
  const [countdown, setCountdown] = useState(null);
  useEffect(() => {
    if (!cooldownUntil) { setCountdown(null); return; }
    const tick = () => {
      const remaining = cooldownUntil - Date.now();
      if (remaining <= 0) { setCountdown(null); return; }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${m}m ${s.toString().padStart(2, "0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  // Poll while sending
  useEffect(() => {
    if (!sending) { clearInterval(pollRef.current); return; }
    pollRef.current = setInterval(async () => {
      try {
        const updated = await getBatchStatus(batch.id);
        setCurrent(updated);
        if (updated.status !== "sending") {
          clearInterval(pollRef.current);
          setSending(false);
          if (updated.status === "sent") {
            toast({ title: `${current.label} sent — ${updated.sent_count} emails delivered` });
            onSent();
          }
        }
      } catch {}
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [sending]);

  const handleSend = async () => {
    if (!smtp.user || !smtp.password) {
      toast({ title: "Enter SMTP credentials first", variant: "destructive" });
      return;
    }
    try {
      await sendBatch(batch.id, { ...smtp, port: parseInt(smtp.port, 10) });
      setSending(true);
      setCurrent((p) => ({ ...p, status: "sending" }));
    } catch (err) {
      toast({ title: "Send failed", description: err.response?.data?.detail || err.message, variant: "destructive" });
    }
  };

  const handleStop = async () => {
    await stopBatch(batch.id);
    setSending(false);
    setCurrent((p) => ({ ...p, status: "paused" }));
    onStop();
  };

  const handleDelete = async () => {
    try {
      await deleteBatch(batch.id);
      onDelete(batch.id);
    } catch (err) {
      toast({ title: "Cannot delete", description: err.response?.data?.detail || err.message, variant: "destructive" });
    }
  };

  const progress = current.total > 0 ? Math.round((current.sent_count / current.total) * 100) : 0;

  const statusColor = {
    pending: "bg-gray-100 text-gray-500",
    sending: "bg-amber-50 text-amber-700",
    sent:    "bg-emerald-50 text-emerald-700",
    paused:  "bg-yellow-50 text-yellow-700",
    error:   "bg-red-50 text-red-600",
  }[current.status] || "bg-gray-100 text-gray-500";

  const inCooldown = cooldownUntil && Date.now() < cooldownUntil;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-gray-900 text-sm">{current.label}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
            {current.status === "sending" ? (
              <span className="flex items-center gap-1"><RefreshCw size={9} className="animate-spin" /> sending</span>
            ) : current.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {current.status === "sending" && (
            <Button size="sm" variant="outline" className="text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={handleStop}>
              <Square size={10} /> Stop
            </Button>
          )}
          {["pending", "paused"].includes(current.status) && (
            <Button
              size="sm"
              className="text-xs gap-1 bg-primary hover:bg-primary-dark"
              onClick={handleSend}
              disabled={inCooldown}
            >
              <Send size={10} />
              {inCooldown ? `Wait ${countdown}` : `Send ${current.label}`}
            </Button>
          )}
          {current.status !== "sending" && (
            <button onClick={handleDelete} className="text-gray-300 hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>{current.sent_count} / {current.total} sent</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center gap-4 text-[10px] text-gray-400">
        <span>{current.total} leads</span>
        {current.error_count > 0 && (
          <span className="text-red-400">{current.error_count} errors</span>
        )}
        {current.finished_at && (
          <span className="flex items-center gap-1">
            <Clock size={9} /> {formatTime(current.finished_at)}
          </span>
        )}
        {inCooldown && countdown && (
          <span className="ml-auto flex items-center gap-1 text-amber-500">
            <Clock size={9} /> Next batch in {countdown}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SendScreen() {
  const { campaign, leads } = useApp();
  const [smtp, setSmtp] = useState({
    host: "smtp.gmail.com",
    port: "587",
    user: "",
    password: "",
  });
  const [batches, setBatches] = useState([]);
  const [stats, setStats] = useState(null);
  const [sendLog, setSendLog] = useState([]);
  const [batchSize, setBatchSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(null); // timestamp of last completed batch
  const { toast } = useToast();

  const approved = leads.filter((l) => l.draft?.status === "approved").length;
  const batched  = leads.filter((l) => l.draft?.status === "batched").length;
  const sent     = leads.filter((l) => l.draft?.status === "sent").length;

  const fetchAll = useCallback(async () => {
    if (!campaign?.id) return;
    const [bl, sl] = await Promise.all([
      listBatches(campaign.id),
      getSendLog(campaign.id),
    ]);
    setBatches(bl);
    setSendLog(sl);
    if (smtp.user) {
      const s = await getSendStats(campaign.id, smtp.user);
      setStats(s);
    }
  }, [campaign?.id, smtp.user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh while any batch is actively sending
  useEffect(() => {
    if (!anyBatchSending) return;
    const id = setInterval(fetchAll, 3000);
    return () => clearInterval(id);
  }, [anyBatchSending, fetchAll]);

  const handleCreateBatches = async () => {
    setCreating(true);
    try {
      const res = await createBatches(campaign.id, batchSize);
      await fetchAll();
      toast({ title: `Created ${res.batches.length} batch${res.batches.length > 1 ? "es" : ""}` });
    } catch (err) {
      toast({ title: "Failed", description: err.response?.data?.detail || err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleBatchSent = () => {
    setLastSentAt(Date.now());
    fetchAll();
  };

  const handleBatchDeleted = (id) => {
    setBatches((p) => p.filter((b) => b.id !== id));
  };

  const [sendingAll, setSendingAll] = useState(false);

  const handleSendAll = async () => {
    if (!smtp.user || !smtp.password) {
      toast({ title: "Enter SMTP credentials first", variant: "destructive" });
      return;
    }
    setSendingAll(true);
    try {
      await sendAllBatches(campaign.id, { ...smtp, port: parseInt(smtp.port, 10) });
      toast({ title: "Sending all batches sequentially — check progress below" });
      fetchAll();
    } catch (err) {
      toast({ title: "Failed to start", description: err.response?.data?.detail || err.message, variant: "destructive" });
    } finally {
      setSendingAll(false);
    }
  };

  const pendingBatches = batches.filter((b) => ["pending", "paused"].includes(b.status));
  const anyBatchSending = batches.some((b) => b.status === "sending");

  // Cooldown: recommend 10 min after each batch finishes
  const cooldownUntil = lastSentAt ? lastSentAt + BATCH_COOLDOWN_MS : null;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Send Campaign</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Drip-send in batches with random delays to avoid spam filters.
        </p>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          <StatPill label="Sent Today" value={stats.today} sub={`cap: ${stats.daily_cap}`} color="text-primary" bg="bg-primary-light" />
          <StatPill label="Remaining Today" value={stats.remaining_today} color="text-emerald-700" bg="bg-emerald-50" />
          <StatPill label="This Month" value={stats.this_month} bg="bg-blue-50" color="text-blue-700" />
          <StatPill label="All Time" value={stats.all_time} bg="bg-gray-50" />
          <StatPill label="Approved" value={approved} sub={`${batched} batched · ${sent} sent`} bg="bg-gray-50" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* SMTP Config */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <p className="font-semibold text-sm flex items-center gap-2">
            <Server size={15} className="text-primary" /> SMTP Configuration
          </p>
          {[
            ["SMTP Host", "host", "smtp.gmail.com", "text"],
            ["Port", "port", "587", "text"],
            ["Username (Email)", "user", "your@gmail.com", "email"],
            ["App Password", "password", "xxxx xxxx xxxx xxxx", "password"],
          ].map(([label, key, placeholder, type]) => (
            <div key={key} className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">{label}</label>
              <Input
                type={type}
                placeholder={placeholder}
                value={smtp[key]}
                onChange={(e) => setSmtp((p) => ({ ...p, [key]: e.target.value }))}
                className="text-sm"
                autoComplete={key === "password" ? "current-password" : undefined}
              />
            </div>
          ))}
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <Info size={13} className="text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-700 leading-relaxed">
              Gmail: enable 2-Step Verification → App Password at{" "}
              <span className="font-mono">myaccount.google.com/apppasswords</span>
            </p>
          </div>
        </div>

        {/* Batch creator */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <p className="font-semibold text-sm flex items-center gap-2">
            <Rocket size={15} className="text-primary" /> Create Batches
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Emails per batch</label>
            <div className="flex gap-2">
              {[10, 20, 30, 50].map((n) => (
                <button
                  key={n}
                  onClick={() => setBatchSize(n)}
                  className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-all ${
                    batchSize === n
                      ? "bg-primary text-white border-primary"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:border-primary-light"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <Info size={13} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">
              Emails within each batch are shuffled randomly. 25–90 second random delay between each.
              Wait 10+ min between batches.
            </p>
          </div>

          <Button
            className="w-full gap-2 bg-primary hover:bg-primary-dark"
            onClick={handleCreateBatches}
            disabled={approved === 0 || creating}
          >
            <Plus size={14} />
            {creating ? "Creating…" : `Split ${approved} Approved into Batches of ${batchSize}`}
          </Button>

          {approved === 0 && (
            <p className="text-xs text-center text-gray-400">
              No approved emails. Go to Review first.
            </p>
          )}
        </div>
      </div>

      {/* Batch cards */}
      {batches.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm text-gray-800 flex items-center gap-2">
              <BarChart2 size={14} className="text-primary" />
              Send Batches
            </p>
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-400">
                25–90s delay · 10 min cooldown between batches
              </p>
              {pendingBatches.length > 0 && (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleSendAll}
                  disabled={sendingAll || anyBatchSending || !smtp.user || !smtp.password}
                >
                  <Zap size={11} />
                  {sendingAll ? "Starting…" : `Send All ${pendingBatches.length} Batches`}
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-3">
            {batches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                smtp={smtp}
                onSent={handleBatchSent}
                onStop={fetchAll}
                onDelete={handleBatchDeleted}
                cooldownUntil={
                  lastSentAt && batch.status === "pending" ? cooldownUntil : null
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Send log */}
      {sendLog.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div>
              <p className="font-semibold text-sm">Send Log</p>
              <p className="text-xs text-gray-400 mt-0.5">{sendLog.length} emails sent</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => exportSendLogCSV(sendLog)}>
              <Download size={12} /> Export CSV
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {sendLog.map((row, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-50 text-sm">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span className="font-medium text-gray-800 min-w-[140px] truncate">{row.lead_name}</span>
                <span className="text-gray-400 flex-1 truncate text-xs">{row.lead_email}</span>
                {row.batch_id && (
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium shrink-0">
                    {batches.find((b) => b.id === row.batch_id)?.label || `#${row.batch_id}`}
                  </span>
                )}
                <span className="text-gray-300 text-xs shrink-0">{formatTime(row.sent_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
