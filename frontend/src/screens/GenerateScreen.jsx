import { useEffect, useRef, useState, useCallback } from "react";
import { Wand2, ArrowRight, RefreshCw, Square } from "lucide-react";
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
  const [singleDrafting, setSingleDrafting] = useState({});
  const [stopping, setStopping] = useState(false);
  const pollRef = useRef(null);
  const { toast } = useToast();

  const drafted  = leads.filter((l) => ["drafted","approved","sent"].includes(l.draft?.status)).length;
  const queued   = leads.filter((l) => l.draft?.status === "queued").length;
  const drafting = leads.filter((l) => l.draft?.status === "drafting").length;
  const errors   = leads.filter((l) => l.draft?.status === "error").length;
  const total    = leads.length;

  const fetchLeads = useCallback(async () => {
    if (!campaign?.id) return [];
    const updated = await getLeads(campaign.id);
    setLeads(updated);
    return updated;
  }, [campaign?.id, setLeads]);

  const checkRunning = useCallback(async () => {
    if (!campaign?.id) return false;
    try {
      const s = await getDraftAllStatus(campaign.id);
      return s.running;
    } catch {
      return false;
    }
  }, [campaign?.id]);

  // Track if a single draft is in-flight for the "queued/drafting" chip display
  const anySingleDrafting = Object.values(singleDrafting).some(Boolean);

  // On mount: load leads and check if a batch is already running (e.g. page reload)
  useEffect(() => {
    fetchLeads().then(async () => {
      const running = await checkRunning();
      if (running) setBatchRunning(true);
    });
  }, [fetchLeads, checkRunning]);

  // Poll every 2s while batch is running
  useEffect(() => {
    if (!batchRunning) {
      clearInterval(pollRef.current);
      return;
    }
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const [updated, running] = await Promise.all([fetchLeads(), checkRunning()]);
      if (!running) {
        clearInterval(pollRef.current);
        setBatchRunning(false);
        setStopping(false);
        // Final refresh to make sure all statuses are up to date
        fetchLeads();
      }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [batchRunning, fetchLeads, checkRunning]);

  const handleDraftAll = async () => {
    if (!campaign?.id || batchRunning) return;
    try {
      await draftAll(campaign.id);
      setBatchRunning(true);
      setStopping(false);
      // Immediate poll to pick up "queued" statuses
      setTimeout(fetchLeads, 500);
    } catch (err) {
      toast({ title: "Failed to start batch", description: err.message, variant: "destructive" });
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopDraftAll(campaign.id);
      setBatchRunning(false);
      setStopping(false);
      await fetchLeads();
    } catch (err) {
      toast({ title: "Stop failed", description: err.message, variant: "destructive" });
      setStopping(false);
    }
  };

  const handleDraftOne = async (leadId) => {
    // Show drafting badge instantly — don't wait for the API
    setLeads((prev) => prev.map((l) =>
      l.id === leadId
        ? { ...l, draft: { ...(l.draft || {}), status: "drafting", error_msg: null } }
        : l
    ));
    setSingleDrafting((p) => ({ ...p, [leadId]: true }));
    try {
      await draftSingle(leadId);    // blocks until AI is done (~5-15s)
      await fetchLeads();           // one refresh to get final state
    } catch (err) {
      toast({ title: "Draft failed", description: err.message, variant: "destructive" });
      await fetchLeads();
    } finally {
      setSingleDrafting((p) => ({ ...p, [leadId]: false }));
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">AI Draft Engine</h1>
          <p className="text-gray-500 mt-2 text-sm">
            AI researches each business and writes a personalized cold email.
          </p>
        </div>
        <div className="flex gap-3">
          {drafted > 0 && !batchRunning && (
            <Button variant="outline" className="gap-2" onClick={() => setScreen("review")}>
              Review {drafted} Drafts <ArrowRight size={14} />
            </Button>
          )}
          {batchRunning ? (
            <Button
              onClick={handleStop}
              disabled={stopping}
              className="bg-red-500 hover:bg-red-600 text-white gap-2"
            >
              {stopping
                ? <><RefreshCw size={14} className="animate-spin" /> Stopping…</>
                : <><Square size={13} /> Stop Queue</>
              }
            </Button>
          ) : errors > 0 ? (
            <Button
              className="bg-red-500 hover:bg-red-600 text-white gap-2"
              onClick={handleDraftAll}
            >
              <RefreshCw size={14} /> Retry {errors} Error{errors > 1 ? "s" : ""}
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

      {/* Progress card */}
      {total > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-gray-800">
              {drafted} of {total} drafted
            </span>
            <span className="text-xs text-gray-400 font-medium">
              {Math.round((drafted / total) * 100)}%
            </span>
          </div>
          <Progress value={(drafted / total) * 100} className="h-2 mb-4" />

          {/* Status chips — shown during batch, single draft, or when errors exist */}
          {(batchRunning || anySingleDrafting || errors > 0) && (
            <div className="flex items-center gap-3 flex-wrap">
              {drafting > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                  <RefreshCw size={10} className="animate-spin" />
                  {drafting} drafting now
                </div>
              )}
              {queued > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                  {queued} queued
                </div>
              )}
              {drafted > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  {drafted} done
                </div>
              )}
              {errors > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  {errors} failed
                </div>
              )}
              {batchRunning && (
                <span className="text-[10px] text-gray-400 ml-auto">
                  Sequential queue · auto rate-limit backoff
                </span>
              )}
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
        {leads.map((lead) => {
          const status = lead.draft?.status || "pending";
          const isSingleDrafting = !!singleDrafting[lead.id];
          const displayStatus = isSingleDrafting ? "drafting" : status;

          return (
            <div
              key={lead.id}
              className="bg-white border border-gray-200 rounded-xl px-5 py-3.5 flex items-center gap-4 hover:border-gray-300 transition-all duration-150"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-0.5">
                  <span className="font-semibold text-sm text-gray-900 truncate">{lead.name}</span>
                  <StatusBadge status={displayStatus} />
                </div>
                <span className="text-xs text-gray-400">
                  {categoryLabel(lead.category)} · {lead.city} · {lead.email}
                </span>
                {displayStatus === "error" && lead.draft?.error_msg && (
                  <p className="text-[10px] text-red-500 mt-0.5 line-clamp-1 max-w-lg">
                    {lead.draft.error_msg}
                  </p>
                )}
              </div>

              {/* Research snippet + model badge once drafted */}
              {lead.draft?.research && (
                <div className="max-w-xs hidden lg:block">
                  <p className="text-xs text-gray-500 italic border-l-2 border-primary-light pl-3 leading-relaxed">
                    {lead.draft.research.slice(0, 100)}{lead.draft.research.length > 100 ? "…" : ""}
                  </p>
                  {lead.draft?.model_used && (
                    <span className="mt-1 inline-block text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono ml-3">
                      {lead.draft.model_used}
                    </span>
                  )}
                </div>
              )}

              {/* Action button */}
              <div className="shrink-0 w-24 flex justify-end">
                {displayStatus === "drafting" && (
                  <RefreshCw size={15} className="text-amber-500 animate-spin" />
                )}
                {displayStatus === "queued" && (
                  <span className="text-[10px] text-indigo-500 font-medium">In queue…</span>
                )}
                {displayStatus === "pending" && !batchRunning && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => handleDraftOne(lead.id)}
                  >
                    <Wand2 size={11} /> Draft
                  </Button>
                )}
                {displayStatus === "error" && !batchRunning && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleDraftOne(lead.id)}
                  >
                    <RefreshCw size={11} /> Retry
                  </Button>
                )}
                {["drafted", "approved"].includes(displayStatus) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
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
