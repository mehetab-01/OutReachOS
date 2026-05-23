import { useState } from "react";
import { Check, X, ArrowRight, Wand2, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import StatusBadge from "../components/StatusBadge";
import { useApp } from "../context/AppContext";
import { patchDraft, getLeads, draftSingle } from "../lib/api";
import { categoryLabel } from "../lib/utils";
import { useToast } from "../components/ui/use-toast";

export default function ReviewScreen() {
  const { campaign, leads, setLeads, setScreen } = useApp();
  const [activeId, setActiveId] = useState(leads[0]?.id || null);
  const [editedFields, setEditedFields] = useState({});
  const { toast } = useToast();

  const activeLead = leads.find((l) => l.id === activeId);
  const activeDraft = activeLead?.draft;

  const drafted = leads.filter((l) =>
    ["drafted", "approved"].includes(l.draft?.status)
  ).length;
  const approved = leads.filter((l) => l.draft?.status === "approved").length;
  const sent = leads.filter((l) => l.draft?.status === "sent").length;

  const refresh = async () => {
    if (!campaign?.id) return;
    const updated = await getLeads(campaign.id);
    setLeads(updated);
  };

  const patch = async (draftId, data) => {
    try {
      await patchDraft(draftId, data);
      await refresh();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const approve = (draftId) => patch(draftId, { status: "approved" });
  const skip = (draftId) => patch(draftId, { status: "skipped" });

  const approveAll = async () => {
    const toApprove = leads.filter((l) => l.draft?.status === "drafted");
    for (const lead of toApprove) {
      await patch(lead.draft.id, { status: "approved" });
    }
    if (toApprove.length > 0) {
      toast({ title: `${toApprove.length} emails approved` });
    }
  };

  const getField = (leadId, field, fallback) =>
    editedFields[leadId]?.[field] ?? fallback;

  const handleEdit = (leadId, field, val) => {
    setEditedFields((p) => ({ ...p, [leadId]: { ...p[leadId], [field]: val } }));
  };

  const saveEdit = async (leadId, draftId) => {
    const edits = editedFields[leadId];
    if (!edits) return;
    await patch(draftId, edits);
    setEditedFields((p) => {
      const n = { ...p };
      delete n[leadId];
      return n;
    });
    toast({ title: "Edits saved" });
  };

  const hasEdits = (leadId) => !!editedFields[leadId];

  const [redrafting, setRedrafting] = useState(false);

  const redraft = async (leadId) => {
    // Optimistically show drafting in the sidebar badge immediately
    setLeads((prev) => prev.map((l) =>
      l.id === leadId
        ? { ...l, draft: { ...(l.draft || {}), status: "drafting", error_msg: null } }
        : l
    ));
    setRedrafting(true);
    const pollId = setInterval(refresh, 1500);
    try {
      await draftSingle(leadId);
      await refresh();
      setEditedFields((p) => { const n = { ...p }; delete n[leadId]; return n; });
      toast({ title: "Redrafted" });
    } catch (err) {
      toast({ title: "Redraft failed", description: err.message, variant: "destructive" });
      await refresh();
    } finally {
      clearInterval(pollId);
      setRedrafting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Review Queue</h1>
          <p className="text-gray-500 mt-2 text-sm">
            {drafted} drafted · {approved} approved · {sent} sent
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={approveAll} disabled={drafted === 0}>
            Approve All Drafted
          </Button>
          <Button
            className="bg-primary hover:bg-primary-dark gap-2"
            onClick={() => setScreen("send")}
            disabled={approved === 0}
          >
            Send {approved} Approved <ArrowRight size={14} />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 min-h-[560px]" style={{ gridTemplateColumns: "280px 1fr" }}>
        {/* Sidebar */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-y-auto max-h-[560px]">
            {leads.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No leads yet.{" "}
                <button
                  className="text-primary underline"
                  onClick={() => setScreen("import")}
                >
                  Import leads
                </button>
              </div>
            ) : (
              leads.map((lead) => {
                const status = lead.draft?.status || "pending";
                const isActive = activeId === lead.id;
                return (
                  <button
                    key={lead.id}
                    onClick={() => setActiveId(lead.id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-all duration-100 ${
                      isActive ? "bg-primary-light" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span
                        className={`text-sm font-medium truncate pr-2 ${
                          isActive ? "text-primary" : "text-gray-800"
                        }`}
                      >
                        {lead.name}
                      </span>
                      <StatusBadge status={status} />
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {categoryLabel(lead.category)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div>
          {!activeLead ? (
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center h-full flex flex-col items-center justify-center">
              <Wand2 size={32} className="text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm">
                Select a lead from the list to review their draft
              </p>
            </div>
          ) : !activeDraft || activeDraft.status === "pending" ? (
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center h-full flex flex-col items-center justify-center">
              <Wand2 size={32} className="text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm">
                No draft yet for this lead.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setScreen("generate")}
              >
                Go to Generate
              </Button>
            </div>
          ) : (
            <div className="space-y-4 animate-slide-in">
              {/* Lead info bar */}
              <div className="bg-white border border-gray-200 rounded-xl px-5 py-3.5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base text-gray-900">{activeLead.name}</p>
                  <p className="text-xs text-gray-400">
                    {categoryLabel(activeLead.category)} · {activeLead.city} · {activeLead.email}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {activeDraft.model_used && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                      {activeDraft.model_used}
                    </span>
                  )}
                  <StatusBadge status={activeDraft.status} />
                  {activeDraft.status !== "sent" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs text-violet-700 border-violet-300 hover:bg-violet-50"
                      onClick={() => redraft(activeLead.id)}
                      disabled={redrafting}
                    >
                      <RefreshCw size={12} className={redrafting ? "animate-spin" : ""} />
                      {redrafting ? "Redrafting…" : "Redraft"}
                    </Button>
                  )}
                  {!["approved", "sent"].includes(activeDraft.status) && (
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary-dark gap-1.5 text-xs"
                      onClick={() => approve(activeDraft.id)}
                    >
                      <Check size={12} /> Approve
                    </Button>
                  )}
                  {!["skipped", "sent"].includes(activeDraft.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => skip(activeDraft.id)}
                    >
                      <X size={12} /> Skip
                    </Button>
                  )}
                  {hasEdits(activeLead.id) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs text-amber-700 border-amber-300"
                      onClick={() => saveEdit(activeLead.id, activeDraft.id)}
                    >
                      Save Edits
                    </Button>
                  )}
                </div>
              </div>

              {/* Research block */}
              {activeDraft.research && (
                <div className="bg-primary-light border border-purple-200 rounded-xl px-5 py-3.5">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1.5">
                    AI Research
                  </p>
                  <p className="text-sm text-purple-900 leading-relaxed">
                    {activeDraft.research}
                  </p>
                </div>
              )}

              {/* Error block */}
              {activeDraft.status === "error" && activeDraft.error_msg && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1.5">
                    Draft Error
                  </p>
                  <p className="text-sm text-red-700 leading-relaxed font-mono">
                    {activeDraft.error_msg}
                  </p>
                </div>
              )}

              {/* Email editor */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Email Draft
                  </p>
                  {hasEdits(activeLead.id) && (
                    <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      edited
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400">SUBJECT</label>
                  <Input
                    value={getField(activeLead.id, "subject", activeDraft.subject || "")}
                    onChange={(e) => handleEdit(activeLead.id, "subject", e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400">BODY</label>
                  <Textarea
                    rows={14}
                    value={getField(activeLead.id, "body", activeDraft.body || "")}
                    onChange={(e) => handleEdit(activeLead.id, "body", e.target.value)}
                    className="text-sm resize-none leading-relaxed whitespace-pre-wrap"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
