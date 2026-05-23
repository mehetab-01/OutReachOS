import { useEffect, useRef, useState } from "react";
import { Server, Rocket, Send, Download, CheckCircle2, Info, XCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useApp } from "../context/AppContext";
import { sendCampaign, getSendLog } from "../lib/api";
import { exportSendLogCSV, formatTime } from "../lib/utils";
import { useToast } from "../components/ui/use-toast";

export default function SendScreen() {
  const { campaign, leads } = useApp();
  const [smtp, setSmtp] = useState({
    host: "smtp.gmail.com",
    port: "587",
    user: "",
    password: "",
  });
  const [sending, setSending] = useState(false);
  const [sendLog, setSendLog] = useState([]);
  const pollRef = useRef(null);
  const { toast } = useToast();

  const approved = leads.filter((l) => l.draft?.status === "approved").length;
  const skipped = leads.filter((l) => l.draft?.status === "skipped").length;

  const updateSmtp = (key, val) => setSmtp((p) => ({ ...p, [key]: val }));

  const fetchLog = async () => {
    if (!campaign?.id) return;
    const logs = await getSendLog(campaign.id);
    setSendLog(logs);
    return logs;
  };

  useEffect(() => {
    if (campaign?.id) fetchLog();
  }, [campaign?.id]);

  useEffect(() => {
    if (sending) {
      pollRef.current = setInterval(async () => {
        const logs = await fetchLog();
        if (logs && logs.length >= approved) {
          clearInterval(pollRef.current);
          setSending(false);
          toast({ title: `${logs.length} emails sent successfully!` });
        }
      }, 2000);
    }
    return () => clearInterval(pollRef.current);
  }, [sending, approved]);

  const handleSend = async () => {
    if (!campaign?.id) return;
    if (!smtp.user || !smtp.password) {
      toast({
        title: "SMTP credentials required",
        description: "Enter your Gmail username and App Password to send emails.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      await sendCampaign(campaign.id, { ...smtp, port: parseInt(smtp.port, 10) });
    } catch (err) {
      toast({
        title: "Send failed",
        description: err.response?.data?.detail || err.message,
        variant: "destructive",
      });
      setSending(false);
    }
  };

  const STATS = [
    { label: "Approved", value: approved, bg: "bg-primary-light", color: "text-primary" },
    { label: "Skipped", value: skipped, bg: "bg-gray-100", color: "text-gray-500" },
    { label: "Sent", value: sendLog.length, bg: "bg-blue-50", color: "text-blue-700" },
    { label: "Total Leads", value: leads.length, bg: "bg-gray-50", color: "text-gray-700" },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Send Campaign</h1>
        <p className="text-gray-500 mt-2 text-sm">
          {approved} emails approved and ready to send.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* SMTP Config */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
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
                onChange={(e) => updateSmtp(key, e.target.value)}
                className="text-sm"
                autoComplete={key === "password" ? "current-password" : undefined}
              />
            </div>
          ))}

          <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <Info size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-700 leading-relaxed">
              For Gmail: enable 2-Step Verification, then generate an App Password at{" "}
              <span className="font-mono font-medium">myaccount.google.com/apppasswords</span>
            </p>
          </div>
        </div>

        {/* Summary + Send */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <p className="font-semibold text-sm flex items-center gap-2">
            <Rocket size={15} className="text-primary" /> Send Summary
          </p>

          <div className="grid grid-cols-2 gap-3">
            {STATS.map(({ label, value, bg, color }) => (
              <div key={label} className={`${bg} rounded-xl p-4`}>
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider ${color} opacity-70 mb-1`}
                >
                  {label}
                </p>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              Anti-spam: 3–8 second random delay between each send to avoid spam filters.
            </p>
          </div>

          <Button
            className="w-full py-3 bg-primary hover:bg-primary-dark gap-2 text-sm"
            disabled={approved === 0 || sending}
            onClick={handleSend}
          >
            {sending ? (
              <><Send size={14} className="animate-pulse" /> Sending…</>
            ) : (
              <><Send size={14} /> Send {approved} Emails Now</>
            )}
          </Button>

          {approved === 0 && leads.length > 0 && (
            <p className="text-xs text-center text-gray-400">
              No approved emails. Go to Review to approve drafts first.
            </p>
          )}
        </div>
      </div>

      {/* Send log */}
      {sendLog.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div>
              <p className="font-semibold text-sm">Send Log</p>
              <p className="text-xs text-gray-400 mt-0.5">{sendLog.length} emails sent</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => exportSendLogCSV(sendLog)}
            >
              <Download size={12} /> Export CSV
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {sendLog.map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-5 py-2.5 border-b border-gray-50 text-sm animate-slide-in"
              >
                <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                <span className="font-medium text-gray-800 min-w-[160px] truncate">
                  {row.lead_name}
                </span>
                <span className="text-gray-400 flex-1 truncate text-xs">{row.lead_email}</span>
                <span className="text-gray-500 text-xs truncate max-w-[200px] hidden md:block">
                  {row.subject}
                </span>
                <span className="text-gray-300 text-xs shrink-0">{formatTime(row.sent_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active sending indicator */}
      {sending && (
        <div className="mt-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 animate-fade-in">
          <Send size={14} className="animate-pulse shrink-0" />
          <span>Sending in progress — emails are going out with a 3–8s delay between each one.</span>
        </div>
      )}
    </div>
  );
}
