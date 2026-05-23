import { useEffect, useRef, useState, useCallback } from "react";
import { Wand2, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import StatusBadge from "../components/StatusBadge";
import { useApp } from "../context/AppContext";
import { draftAll, draftSingle, getLeads } from "../lib/api";
import { categoryLabel } from "../lib/utils";
import { useToast } from "../components/ui/use-toast";

export default function GenerateScreen() {
  const { campaign, leads, setLeads, setScreen } = useApp();
  const [batchRunning, setBatchRunning] = useState(false);
  const [drafting, setDrafting] = useState({}); // leadId → true when single-drafting
  const pollRef = useRef(null);
  const { toast } = useToast();

  const drafted = leads.filter((l) =>
    ["drafted", "approved", "sent"].includes(l.draft?.status)
  ).length;
  const total = leads.length;
  const anyDrafting = leads.some((l) => l.draft?.status === "drafting");

  const fetchLeads = useCallback(async () => {
    if (!campaign?.id) return;
    const updated = await getLeads(campaign.id);
    setLeads(updated);
    return updated;
  }, [campaign?.id, setLeads]);

  // Load fresh lead state on mount to clear stale error/drafting status
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Poll while batch is running or any lead is in "drafting" status
  useEffect(() => {
    const shouldPoll = batchRunning || anyDrafting;
    if (shouldPoll) {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const updated = await fetchLeads();
        const stillDrafting = updated?.some((l) => l.draft?.status === "drafting");
        if (!stillDrafting) {
          clearInterval(pollRef.current);
          setBatchRunning(false);
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
    try {
      await draftAll(campaign.id);
    } catch (err) {
      toast({ title: "Draft failed", description: err.message, variant: "destructive" });
      setBatchRunning(false);
    }
  };

  const handleDraftOne = async (leadId) => {
    setDrafting((p) => ({ ...p, [leadId]: true }));
    try {
      await draftSingle(leadId);
      await fetchLeads();
    } catch (err) {
      toast({ title: "Draft failed", description: err.message, variant: "destructive" });
    } finally {
      setDrafting((p) => ({ ...p, [leadId]: false }));
    }
  };

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
          <Button
            className="bg-primary hover:bg-primary-dark gap-2"
            onClick={handleDraftAll}
            disabled={batchRunning || total === 0}
          >
            {batchRunning ? (
              <><RefreshCw size={14} className="animate-spin" /> Drafting…</>
            ) : (
              <><Wand2 size={14} /> Draft All {total} Leads</>
            )}
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              {drafted} of {total} drafted
            </span>
            <span className="text-xs text-gray-400">
              {Math.round((drafted / total) * 100)}%
            </span>
          </div>
          <Progress value={(drafted / total) * 100} className="h-2" />
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
          const isSingleDrafting = drafting[lead.id] || status === "drafting";

          return (
            <div
              key={lead.id}
              className="bg-white border border-gray-200 rounded-xl px-5 py-3.5 flex items-center gap-4 hover:border-gray-300 hover:shadow-sm transition-all duration-150"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-0.5">
                  <span className="font-semibold text-sm text-gray-900">{lead.name}</span>
                  <StatusBadge status={isSingleDrafting ? "drafting" : status} />
                </div>
                <span className="text-xs text-gray-400">
                  {categoryLabel(lead.category)} · {lead.city} · {lead.email}
                </span>
                {/* Error message */}
                {status === "error" && lead.draft?.error_msg && (
                  <p className="text-[10px] text-red-500 mt-1 truncate max-w-lg">
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
