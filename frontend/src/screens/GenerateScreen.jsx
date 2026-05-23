import { useEffect, useRef, useState, useCallback } from "react";
import { Wand2, ArrowRight, RefreshCw, Square, Clock, AlertTriangle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import StatusBadge from "../components/StatusBadge";
import { useApp } from "../context/AppContext";
import { draftAll, draftSingle, getLeads, stopDraftAll, getDraftAllStatus } from "../lib/api";
import { categoryLabel } from "../lib/utils";
import { useToast } from "../components/ui/use-toast";

export default function GenerateScreen() {
  const { campaign, leads, setLeads, setScreen } = useApp();
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStatus, setBatchStatus] = useState(null); // {running, total, done, counts}
  const [singleDrafting, setSingleDrafting] = useState({}); // leadId → true
  const [stopping, setStopping] = useState(false);
  const pollRef = useRef(null);
  const { toast } = useToast();

  const drafted = leads.filter((l) =>
    ["drafted", "approved", "sent"].includes(l.draft?.status)
  ).length;
  const total = leads.length;
  const anyDrafting = leads.some((l) => l.draft?.status === "drafting");

  const fetchLeads = useCallback(async () => {
    if (!campaign?.id) return [];
    const updated = await getLeads(campaign.id);
    setLeads(updated);
    return updated;
  }, [campaign?.id, setLeads]);

  const fetchStatus = useCallback(async () => {
    if (!campaign?.id) return null;
    const s = await getDraftAllStatus(campaign.id);
    setBatchStatus(s);
    return s;
  }, [campaign?.id]);

  // Load fresh state on mount
  useEffect(() => {
    fetchLeads();
    fetchStatus();
  }, [fetchLeads, fetchStatus]);

  // Poll while batch is running
  useEffect(() => {
    const shouldPoll = batchRunning || anyDrafting;
    if (shouldPoll) {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const [, status] = await Promise.all([fetchLeads(), fetchStatus()]);
        if (!status?.running && !anyDrafting) {
          clearInterval(pollRef.current);
          setBatchRunning(false);
          setStopping(false);
        }
      }, 2000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [batchRunning, anyDrafting]); // eslint-disable-line

  const handleDraftAll = async () => {
    if (!campaign?.id) return;
    setBatchRunning(true);
    setStopping(false);
    try {
      await draftAll(campaign.id);
      await fetchStatus();
    } catch (err) {
      toast({ title: "Failed to start batch", description: err.message, variant: "destructive" });
      setBatchRunning(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopDraftAll(campaign.id);
      await fetchLeads();
      await fetchStatus();
      setBatchRunning(false);
    } catch (err) {
      toast({ title: "Stop failed", description: err.message, variant: "destructive" });
    } finally {
      setStopping(false);
    }
  };

  const handleDraftOne = async (leadId) => {
    setSingleDrafting((p) => ({ ...p, [leadId]: true }));
    try {
      await draftSingle(leadId);
      await fetchLeads();
    } catch (err) {
      toast({ title: "Draft failed", description: err.message, variant: "destructive" });
    } finally {
      setSingleDrafting((p) => ({ ...p, [leadId]: false }));
    }
  };

  const pendingCount = batchStatus?.counts?.pending ?? leads.filter((l) => !l.draft || l.draft.status === "pending").length;
  const errorCount = batchStatus?.counts?.error ?? leads.filter((l) => l.draft?.status === "error").length;
  const isRunning = batchRunning || batchStatus?.running;

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">AI Draft Engine</h1>
          <p className="text-gray-500 mt-2 text-sm">
            AI researches each business and writes a personalized email.
          </p>
        </div>
        <div className="flex gap-3">
          {drafted > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => setScreen("review")}>
              View {drafted} Drafts <ArrowRight size={14} />
            </Button>
          )}
          {isRunning ? (
            <Button
              className="bg-red-500 hover:bg-red-600 gap-2 text-white"
              onClick={handleStop}
              disabled={stopping}
            >
              {stopping
                ? <><RefreshCw size={14} className="animate-spin" /> Stopping…</>
                : <><Square size={14} /> Stop Queue</>
              }
            </Button>
          ) : (
            <Button
              className="bg-primary hover:bg-primary-dark gap-2"
              onClick={handleDraftAll}
              disabled={total === 0}
            >
              <Wand2 size={14} /> Draft All {total} Leads
            </Button>
          )}
        </div>
      </div>

      {/* Progress + queue status */}
      {total > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">
              {drafted} of {total} drafted
            </span>
            <span className="text-xs text-gray-400">
              {Math.round((drafted / total) * 100)}%
            </span>
          </div>
          <Progress value={(drafted / total) * 100} className="h-2" />

          {/* Queue stats when running */}
          {isRunning && (
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <RefreshCw size={11} className="animate-spin" />
                <span className="font-medium">{batchStatus?.counts?.drafting ?? 1} drafting</span>
              </div>
              {pendingCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock size={11} />
                  <span>{pendingCount} in queue</span>
                </div>
              )}
              {errorCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-red-500">
                  <AlertTriangle size={11} />
                  <span>{errorCount} failed</span>
                </div>
              )}
              <span className="text-[10px] text-gray-400 ml-auto">
                2s between calls · auto-backoff on rate limits
              </span>
            </div>
          )}

          {/* Rate limit warning when not running but errors exist */}
          {!isRunning && errorCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle size={12} />
              <span>
                {errorCount} lead{errorCount > 1 ? "s" : ""} failed. Click Retry on each, or add more API keys in Configure for higher quota.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {total === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <Wand2 size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No leads imported yet.</p>
          <Button variant="outline" className="mt-4" onClick={() => setScreen("import")}>
            Go to Import
          </Button>
        </div>
      )}

      {/* Lead list */}
      <div className="space-y-2">
        {leads.map((lead, idx) => {
          const status = lead.draft?.status || "pending";
          const isSingleDrafting = singleDrafting[lead.id] || status === "drafting";

          // Queue position: count pending leads before this one
          const queuePos = isRunning && status === "pending"
            ? leads.slice(0, idx).filter((l) => !l.draft || l.draft.status === "pending").length + 1
            : null;

          return (
            <div
              key={lead.id}
              className="bg-white border border-gray-200 rounded-xl px-5 py-3.5 flex items-center gap-4 hover:border-gray-300 hover:shadow-sm transition-all duration-150"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-0.5">
                  <span className="font-semibold text-sm text-gray-900">{lead.name}</span>
                  <StatusBadge status={isSingleDrafting ? "drafting" : status} />
                  {queuePos && (
                    <span className="text-[10px] text-gray-400 font-medium">
                      #{queuePos} in queue
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {categoryLabel(lead.category)} · {lead.city} · {lead.email}
                </span>
                {status === "error" && lead.draft?.error_msg && (
                  <p className="text-[10px] text-red-500 mt-1 line-clamp-1 max-w-lg">
                    {lead.draft.error_msg}
                  </p>
                )}
              </div>

              {/* Research preview */}
              {lead.draft?.research && (
                <div className="max-w-xs text-xs text-gray-500 italic border-l-2 border-[#EEEDFE] pl-3 leading-relaxed hidden lg:block">
                  {lead.draft.research.length > 100
                    ? lead.draft.research.slice(0, 100) + "…"
                    : lead.draft.research}
                </div>
              )}

              <div className="shrink-0">
                {isSingleDrafting && (
                  <RefreshCw size={15} className="text-amber-500 animate-spin" />
                )}
                {!isSingleDrafting && status === "pending" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => handleDraftOne(lead.id)}
                    disabled={isRunning}
                  >
                    <Wand2 size={12} /> Draft
                  </Button>
                )}
                {!isSingleDrafting && status === "error" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-red-600 border-red-200 gap-1.5 hover:bg-red-50"
                    onClick={() => handleDraftOne(lead.id)}
                    disabled={isRunning}
                  >
                    <RefreshCw size={12} /> Retry
                  </Button>
                )}
                {!isSingleDrafting && ["drafted", "approved"].includes(status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => setScreen("review")}
                  >
                    Review
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
