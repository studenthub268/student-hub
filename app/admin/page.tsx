"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAdminPanelData,
  unblockIp,
  blockIp,
  addAdminEmail,
  removeAdminEmail,
  adminDeleteResource,
  adminUpdateResource,
  adminDeleteUser,
  deleteMessage,
  deleteReport,
  dismissReportAndDeleteResource,
} from "@/lib/actions/admin";
import { toast } from "react-hot-toast";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Users,
  Globe,
  Trash2,
  Plus,
  AlertTriangle,
  FileText,
  Mail,
  Edit3,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flag,
  Ban,
  Lock,
  Eye,
  ArrowRight,
  Inbox,
  Reply,
  CheckCheck,
  Loader2,
  Gauge,
} from "lucide-react";
import Link from "next/link";
import { replyToMessage } from "@/lib/actions/messages";
import { getErrorMessage } from "@/lib/utils";
import { isPermanentAdmin } from "@/lib/constants";
import type { BlockedIp, AdminEmail, Message } from "@/lib/db/schema";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import dynamic from "next/dynamic";

// Lazy-loaded: the Traffic tab pulls its own data via getTrafficData, so the
// other tabs never pay for its JS or query until they open it.
const TrafficTab = dynamic(() => import("./TrafficTab"));
// Same for the Vitals tab (getWebVitalsData) — real-user Core Web Vitals.
const VitalsTab = dynamic(() => import("./VitalsTab"));

type Tab = "overview" | "moderation" | "security" | "users" | "diagnostics";

// sessionStorage cache so revisits within the same tab render instantly and
// revalidate in the background. Stale-while-revalidate: cached data shows
// immediately, fresh data replaces it when the server responds.
const ADMIN_CACHE_KEY = "admin-panel-cache-v3";
const ADMIN_CACHE_TTL_MS = 60_000;

type AdminPanelData = {
  blockedIps: BlockedIp[];
  admins: AdminEmail[];
  resources: AdminResource[];
  messages: Message[];
  reports: AdminReport[];
  emailStats: EmailStats | null;
  autoBlocks: AutoBlock[];
  users: AdminUser[];
};

function readCache(): { data: AdminPanelData; age: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ADMIN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: AdminPanelData };
    const age = Date.now() - parsed.savedAt;
    if (age > 5 * 60_000) return null; // hard-stale: don't show pre-refresh
    return { data: parsed.data, age };
  } catch {
    return null;
  }
}

function writeCache(data: AdminPanelData) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Quota exceeded — caching is best-effort only
  }
}

interface AdminResource {
  id: string;
  title: string;
  description: string | null;
  type: string;
  subject: string;
  department: string | null;
  professor: string | null;
  likes: number;
  createdAt: Date;
  uploader: { name: string | null; email: string | null } | null;
}

interface AdminReport {
  id: string;
  reason: string;
  description: string;
  createdAt: Date;
  resource: { id: string; title: string } | null;
  reporter: { name: string | null; email: string | null } | null;
}

interface EmailStats {
  totals: { sent: number; delivered: number; bounced: number; complained: number; opened: number; clicked: number; deliveryRate: string; bounceRate: string; openRate: string };
  recentFailures: { id: string; eventType: string; to: string | null; subject: string | null; createdAt: Date }[];
  suppressedCount: number;
  recentSuppressions: { id: string; email: string; reason: string; suppressedAt: Date }[];
}

interface AutoBlock {
  id: string;
  ip: string;
  reason: string;
  type: string | null;
  blockedAt: Date;
}

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: Date | null;
  createdAt: Date;
  providers: string[];
  resourceCount: number;
}

// Hydrate from the sessionStorage cache synchronously on first render so a
// revisit paints full data immediately (no spinner, no guest flash).
const initialCache = readCache();

export default function AdminPanel() {
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>(initialCache?.data.blockedIps ?? []);
  const [adminEmails, setAdminEmails] = useState<AdminEmail[]>(initialCache?.data.admins ?? []);
  const [resourcesList, setResourcesList] = useState<AdminResource[]>(initialCache?.data.resources ?? []);
  const [messagesList, setMessagesList] = useState<Message[]>(initialCache?.data.messages ?? []);
  const [reportsList, setReportsList] = useState<AdminReport[]>(initialCache?.data.reports ?? []);
  const [newIp, setNewIp] = useState("");
  const [newIpReason, setNewIpReason] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [loading, setLoading] = useState(!initialCache);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editingResource, setEditingResource] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", subject: "", type: "", professor: "", department: "" });
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(initialCache?.data.emailStats ?? null);
  const [autoBlocks, setAutoBlocks] = useState<AutoBlock[]>(initialCache?.data.autoBlocks ?? []);
  const [usersList, setUsersList] = useState<AdminUser[]>(initialCache?.data.users ?? []);

  // Themed delete confirmation (replaces native confirm())
  const [confirmState, setConfirmState] = useState<null | {
    type: "resource" | "reported" | "user";
    id: string;
    title: string;
    email?: string;
    reportId?: string;
  }>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const loadData = useCallback(async (opts?: { background?: boolean }) => {
    try {
      const data = await getAdminPanelData();
      setBlockedIps(data.blockedIps);
      setAdminEmails(data.admins);
      setResourcesList(data.resources);
      setMessagesList(data.messages);
      setReportsList(data.reports);
      setEmailStats(data.emailStats);
      setAutoBlocks(data.autoBlocks);
      setUsersList(data.users);
      writeCache(data);
    } catch (error) {
      if (!opts?.background) toast.error(getErrorMessage(error, "Failed to load admin data"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Revalidate in the background; data may already be on screen from cache.
    // Fresh cache (< 60s old) skips the refetch entirely. loadData is async
    // (setState happens after awaits) and reused by mutation handlers.
    if (initialCache && initialCache.age < ADMIN_CACHE_TTL_MS) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData({ background: !!initialCache });
  }, [loadData]);

  // ---- IP Management ----
  const handleBlockIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIp.trim() || !newIpReason.trim()) {
      toast.error("Enter IP and reason");
      return;
    }
    try {
      await blockIp(newIp.trim(), newIpReason.trim());
      toast.success(`Blocked ${newIp}`);
      setNewIp("");
      setNewIpReason("");
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleUnblockIp = async (ip: string) => {
    try {
      await unblockIp(ip);
      toast.success(`Unblocked ${ip}`);
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  // ---- Resource Management ----
  const handleDeleteResource = (id: string, title: string) => {
    setConfirmState({ type: "resource", id, title });
  };

  const startEdit = (resource: AdminResource) => {
    setEditingResource(resource.id);
    setEditForm({
      title: resource.title || "",
      description: resource.description || "",
      subject: resource.subject || "",
      type: resource.type || "",
      professor: resource.professor || "",
      department: resource.department || "",
    });
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await adminUpdateResource(id, editForm);
      toast.success("Resource updated");
      setEditingResource(null);
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  // ---- Message Management ----
  const handleDeleteMessage = async (id: string) => {
    try {
      await deleteMessage(id);
      toast.success("Message deleted");
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  // Reply state: which message's composer is open + its draft.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  // Inbox filter: unanswered first by default — that's the queue to work.
  // "answered" flips to the archive view; "all" shows everything.
  const [messageFilter, setMessageFilter] = useState<"pending" | "answered" | "all">("pending");
  const filteredMessages = messagesList.filter((m) =>
    messageFilter === "pending" ? !m.repliedAt : messageFilter === "answered" ? Boolean(m.repliedAt) : true
  );

  const openReply = (msg: Message) => {
    setReplyingTo(msg.id);
    setReplyDraft(`Hi ${msg.name.split(/\s+/)[0] || "there"},\n\n`);
  };

  const handleSendReply = async (id: string) => {
    if (!replyDraft.trim()) {
      toast.error("Write a reply first");
      return;
    }
    setIsReplying(true);
    try {
      const res = await replyToMessage({ messageId: id, reply: replyDraft.trim() });
      if (!res.success) {
        toast.error(res.error ?? "Failed to send reply");
      } else {
        toast.success("Reply sent — the sender gets it by email");
        setReplyingTo(null);
        setReplyDraft("");
        loadData();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to send reply"));
    } finally {
      setIsReplying(false);
    }
  };

  // ---- Report Management ----
  const handleDeleteReport = async (id: string) => {
    try {
      await deleteReport(id);
      toast.success("Report dismissed");
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDeleteReportedResource = (reportId: string, resourceId: string, title: string) => {
    setConfirmState({ type: "reported", id: resourceId, title, reportId });
  };

  // ---- Admin Management ----
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim()) return;
    try {
      await addAdminEmail(newAdminEmail.trim());
      toast.success(`Added ${newAdminEmail} as admin`);
      setNewAdminEmail("");
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handlePromoteUser = async (email: string) => {
    try {
      await addAdminEmail(email);
      toast.success(`${email} is now an admin`);
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDemoteUser = async (email: string) => {
    try {
      await removeAdminEmail(email);
      toast.success(`${email} is no longer an admin`);
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDeleteUser = (id: string, email: string) => {
    setConfirmState({ type: "user", id, title: email, email });
  };

  const executeConfirmedDelete = async () => {
    if (!confirmState) return;
    setIsConfirming(true);
    try {
      if (confirmState.type === "resource") {
        await adminDeleteResource(confirmState.id);
        toast.success("Resource deleted");
      } else if (confirmState.type === "reported" && confirmState.reportId) {
        await dismissReportAndDeleteResource(confirmState.reportId, confirmState.id);
        toast.success("Resource deleted and report dismissed");
      } else if (confirmState.type === "user") {
        await adminDeleteUser(confirmState.id);
        toast.success(`Deleted account ${confirmState.email}`);
      }
      setConfirmState(null);
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-line border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  // Attention items drive the Overview: anything an admin must act on.
  const attentionReports = reportsList.length;
  const attentionMessages = messagesList.length;
  const attentionAutoBlocks = autoBlocks.length;
  const highBounce = emailStats ? Number(emailStats.totals.bounceRate) > 5 : false;

  const tabs: { key: Tab; label: string; icon: LucideIcon; count?: number; alert?: boolean }[] = [
    { key: "overview", label: "Overview", icon: Shield },
    { key: "moderation", label: "Moderation", icon: FileText, count: resourcesList.length },
    { key: "security", label: "Security", icon: ShieldOff, count: blockedIps.length, alert: attentionAutoBlocks > 0 },
    { key: "users", label: "Users", icon: Users, count: usersList.length },
    { key: "diagnostics", label: "Diagnostics", icon: Eye, alert: highBounce },
  ];

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Admin Panel</h1>
        <p className="text-foreground/60 font-medium">
          {attentionReports + attentionMessages + attentionAutoBlocks > 0
            ? `${attentionReports + attentionMessages + attentionAutoBlocks} item${attentionReports + attentionMessages + attentionAutoBlocks === 1 ? "" : "s"} need attention.`
            : "All clear — nothing needs attention."}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm tracking-wider transition-all ${
                activeTab === tab.key
                  ? "bg-ink on-ink"
                  : "bg-surface-muted text-foreground hover:bg-line/60"
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key ? "bg-surface/20" : "bg-line"
                }`}>
                  {tab.count}
                </span>
              )}
              {tab.alert && activeTab !== tab.key && (
                <span className="ml-0.5 w-2 h-2 rounded-full bg-red-500" aria-label="needs attention" />
              )}
            </button>
          );
        })}
      </div>

      {/* ===== OVERVIEW ===== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Attention cards — each jumps straight to the queue it summarizes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { key: "moderation" as const, label: "Reports", count: attentionReports, icon: Flag, desc: "Resources flagged by students" },
              { key: "moderation" as const, label: "Messages", count: attentionMessages, icon: Inbox, desc: "Contact form submissions" },
              { key: "security" as const, label: "Auto-blocks", count: attentionAutoBlocks, icon: AlertTriangle, desc: "System blocks, last 7 days" },
            ].map(({ key, label, count, icon: Icon, desc }) => (
              <button
                key={label}
                onClick={() => setActiveTab(key)}
                className={`text-left rounded-[2rem] border-2 border-ink bg-surface p-6 shadow-hard-sm transition-all hover:-translate-y-0.5 hover:shadow-hard ${count > 0 ? "" : "opacity-60"}`}
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink ${count > 0 ? "bg-accent text-accent-contrast" : "bg-surface-muted text-foreground"}`}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <ArrowRight className="h-4 w-4 text-foreground/40" aria-hidden />
                </div>
                <p className="mt-4 text-3xl font-black tracking-tighter tabular-nums">{count}</p>
                <p className="text-sm font-bold tracking-wider">{label}</p>
                <p className="text-xs font-medium text-foreground/60 mt-0.5">{desc}</p>
              </button>
            ))}
          </div>

          {/* Latest items preview — the top of each queue without leaving Overview */}
          {attentionReports > 0 && (
            <div className="rounded-2xl border-2 border-line bg-surface p-6">
              <h3 className="font-bold mb-3 flex items-center gap-2"><Flag className="h-4 w-4 text-red-500" aria-hidden /> Latest report</h3>
              {(() => {
                const r = reportsList[0];
                return (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{r.resource?.title || "Deleted resource"}</p>
                      <p className="text-xs text-foreground/60 font-medium">{r.reason} · by {r.reporter?.name || "Unknown"}</p>
                    </div>
                    <button onClick={() => setActiveTab("moderation")} className="shrink-0 text-xs font-bold text-accent hover:underline">Review</button>
                  </div>
                );
              })()}
            </div>
          )}

          {attentionMessages > 0 && (
            <div className="rounded-2xl border-2 border-line bg-surface p-6">
              <h3 className="font-bold mb-3 flex items-center gap-2"><Inbox className="h-4 w-4 text-accent" aria-hidden /> Latest message</h3>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{messagesList[0].name}</p>
                  <p className="text-xs text-foreground/60 font-medium truncate">{messagesList[0].message}</p>
                </div>
                <button onClick={() => setActiveTab("moderation")} className="shrink-0 text-xs font-bold text-accent hover:underline">Read</button>
              </div>
            </div>
          )}

          {/* Quick stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Resources", value: resourcesList.length },
              { label: "Users", value: usersList.length },
              { label: "Admins", value: adminEmails.length },
              { label: "Blocked IPs", value: blockedIps.length },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border-2 border-line bg-surface-muted p-4 text-center">
                <p className="text-2xl font-black tracking-tighter tabular-nums">{s.value}</p>
                <p className="text-xs font-bold tracking-wider text-foreground/60 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== MODERATION (resources + reports + messages) ===== */}
      {activeTab === "moderation" && (
        <div className="space-y-10">
          {/* Reports first — they block content quality */}
          <section>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Flag className="h-4 w-4 text-red-500" aria-hidden /> Reports ({reportsList.length})
            </h3>
            <div className="space-y-3">
              {reportsList.length === 0 ? (
                <p className="text-sm text-foreground/60 font-medium p-4 rounded-xl bg-surface-muted">No open reports.</p>
              ) : (
                reportsList.map((report) => {
                  const reportedResource = report.resource;
                  return (
                    <div key={report.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 rounded-xl border-2 border-red-100 bg-surface">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">{report.reason}</span>
                          <span className="text-xs text-foreground/60 font-medium">{new Date(report.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="font-bold text-sm mt-1">{reportedResource?.title || "Deleted"}</p>
                        <p className="text-xs text-foreground/60 font-medium mt-0.5">
                          by {report.reporter?.name || "Unknown"} ({report.reporter?.email})
                        </p>
                        {report.description && (
                          <p className="text-xs text-foreground/60 font-medium mt-2 p-3 bg-surface-muted rounded-lg">{report.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                        {reportedResource?.id && (
                          <Link href={`/resource/${reportedResource.id}`} target="_blank" className="p-2 rounded-lg border-2 border-line hover:bg-surface-muted transition-colors" aria-label="Open resource">
                            <ExternalLink className="w-4 h-4" aria-hidden />
                          </Link>
                        )}
                        {reportedResource?.id && (
                          <button
                            onClick={() => handleDeleteReportedResource(report.id, reportedResource!.id, reportedResource!.title)}
                            className="p-2 rounded-lg border-2 border-red-200 text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all"
                            title="Delete resource & dismiss report"
                            aria-label="Delete resource and dismiss report"
                          >
                            <Ban className="w-4 h-4" aria-hidden />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteReport(report.id)}
                          className="p-2 rounded-lg border-2 border-line hover:bg-surface-muted transition-colors"
                          title="Dismiss report only"
                          aria-label="Dismiss report"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Inbox className="h-4 w-4 text-accent" aria-hidden /> Messages ({messagesList.length})
            </h3>
            {/* Read/answered filter: pending = unanswered, answered = replied,
                all = everything. Counts shown inline so the state of the
                inbox is visible without switching tabs. */}
            {(() => {
              const answeredCount = messagesList.filter((m) => m.repliedAt).length;
              const pendingCount = messagesList.length - answeredCount;
              const filters = [
                { key: "pending" as const, label: "Pending", count: pendingCount },
                { key: "answered" as const, label: "Answered", count: answeredCount },
                { key: "all" as const, label: "All", count: messagesList.length },
              ];
              return (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {filters.map((f) => {
                    const active = messageFilter === f.key;
                    return (
                      <button
                        key={f.key}
                        onClick={() => setMessageFilter(f.key)}
                        className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-xs font-bold transition-all ${
                          active
                            ? "border-ink bg-ink on-ink shadow-hard-sm"
                            : "border-line bg-surface text-foreground/60 hover:text-foreground hover:border-foreground/30"
                        }`}
                        aria-pressed={active}
                      >
                        {f.label}
                        <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-background/20" : "bg-surface-muted"}`}>
                          {f.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <div className="space-y-3">
              {filteredMessages.length === 0 ? (
                <p className="text-sm text-foreground/60 font-medium p-4 rounded-xl bg-surface-muted">
                  {messageFilter === "pending"
                    ? "All caught up — no unanswered messages."
                    : messageFilter === "answered"
                      ? "No replies sent yet."
                      : "No messages."}
                </p>
              ) : (
                filteredMessages.map((msg) => (
                  <div key={msg.id} className="p-4 rounded-xl border-2 border-line bg-surface">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedMessage(expandedMessage === msg.id ? null : msg.id)}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-accent" aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm">{msg.name}</p>
                            <p className="text-xs text-foreground/60 font-medium">{msg.email}</p>
                          </div>
                        </div>
                        {expandedMessage !== msg.id && (
                          <p className="text-xs text-foreground/60 font-medium mt-2 ml-11 truncate">{msg.message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                        {msg.repliedAt && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[11px] font-bold text-green-700" title={msg.replyText ?? ""}>
                            <CheckCheck className="w-3 h-3" aria-hidden />
                            Replied
                          </span>
                        )}
                        <span className="text-xs text-foreground/70 font-medium">{new Date(msg.createdAt).toLocaleDateString()}</span>
                        {expandedMessage === msg.id ? <ChevronUp className="w-4 h-4 text-foreground/50" aria-hidden /> : <ChevronDown className="w-4 h-4 text-foreground/50" aria-hidden />}
                        <button
                          onClick={(e) => { e.stopPropagation(); if (replyingTo === msg.id) setReplyingTo(null); else openReply(msg); }}
                          className="p-1.5 rounded-lg hover:bg-accent/10 hover:text-accent transition-colors"
                          aria-label={msg.repliedAt ? "Reply again" : "Reply to message"}
                        >
                          <Reply className="w-3.5 h-3.5" aria-hidden />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id); }} className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors" aria-label="Delete message">
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                    {expandedMessage === msg.id && (
                      <div className="mt-4 ml-11 p-4 bg-surface-muted rounded-xl">
                        <p className="text-sm font-medium text-foreground/70 whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    )}
                    {/* Reply composer: prefilled greeting, sends by email. */}
                    {replyingTo === msg.id && (
                      <div className="mt-4 ml-0 sm:ml-11 p-4 rounded-xl border-2 border-accent/30 bg-accent/5" onClick={(e) => e.stopPropagation()}>
                        <label htmlFor={`reply-${msg.id}`} className="mb-2 block text-xs font-bold uppercase tracking-wider text-foreground/60">
                          Reply to {msg.name} ({msg.email})
                        </label>
                        <textarea
                          id={`reply-${msg.id}`}
                          value={replyDraft}
                          onChange={(e) => setReplyDraft(e.target.value)}
                          rows={5}
                          placeholder="Your reply — sent to their email as coming from the Student Hub team."
                          className="w-full rounded-xl border-2 border-line bg-surface px-3.5 py-3 text-sm font-medium text-foreground focus:border-accent focus:outline-none resize-y"
                          autoFocus
                        />
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setReplyingTo(null); setReplyDraft(""); }}
                            className="rounded-full px-4 py-2 text-xs font-bold text-foreground/60 hover:bg-surface-muted transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSendReply(msg.id)}
                            disabled={isReplying || !replyDraft.trim()}
                            className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-accent px-4 py-2 text-xs font-bold tracking-wider text-accent-contrast shadow-hard-sm transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                          >
                            {isReplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
                            {isReplying ? "Sending..." : "Send reply"}
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Previous reply, shown inline under the original. */}
                    {msg.repliedAt && replyingTo !== msg.id && msg.replyText && (
                      <div className="mt-3 ml-0 sm:ml-11 p-3.5 rounded-xl border border-green-200 bg-green-50">
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-green-700">
                          Replied {new Date(msg.repliedAt).toLocaleDateString()}
                        </p>
                        <p className="text-sm font-medium text-green-900/80 whitespace-pre-wrap">{msg.replyText}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4" aria-hidden /> All resources ({resourcesList.length})
            </h3>
            <div className="space-y-3">
              {resourcesList.length === 0 ? (
                <p className="text-sm text-foreground/60 font-medium p-4 rounded-xl bg-surface-muted">No resources yet.</p>
              ) : (
                resourcesList.map((res) => (
                  <div key={res.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-2 border-line bg-surface">
                    {editingResource === res.id ? (
                      <div className="space-y-3 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-sm">Editing resource</h4>
                          <button onClick={() => setEditingResource(null)} className="p-1 hover:bg-surface-muted rounded-lg" aria-label="Cancel edit"><X className="w-4 h-4" aria-hidden /></button>
                        </div>
                        <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full h-10 px-3 rounded-lg border-2 border-line text-sm font-medium focus:outline-none" placeholder="Title" />
                        <input value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} className="w-full h-10 px-3 rounded-lg border-2 border-line text-sm font-medium focus:outline-none" placeholder="Subject" />
                        <input value={editForm.professor} onChange={(e) => setEditForm({ ...editForm, professor: e.target.value })} className="w-full h-10 px-3 rounded-lg border-2 border-line text-sm font-medium focus:outline-none" placeholder="Professor" />
                        <input value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} className="w-full h-10 px-3 rounded-lg border-2 border-line text-sm font-medium focus:outline-none" placeholder="Department" />
                        <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="w-full h-20 px-3 py-2 rounded-lg border-2 border-line text-sm font-medium focus:outline-none resize-none" placeholder="Description" />
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveEdit(res.id)} className="px-4 py-2 rounded-full bg-accent text-accent-contrast font-bold text-xs tracking-wider">Save</button>
                          <button onClick={() => setEditingResource(null)} className="px-4 py-2 rounded-full bg-surface-muted font-bold text-xs tracking-wider">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm truncate">{res.title}</p>
                          <p className="text-xs text-foreground/60 font-medium mt-0.5">
                            {res.subject} · {res.type} · {res.uploader?.name || "Anonymous"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                          <Link href={`/resource/${res.id}`} target="_blank" className="p-2 rounded-lg border-2 border-line hover:bg-surface-muted transition-colors" aria-label="Open resource">
                            <ExternalLink className="w-4 h-4" aria-hidden />
                          </Link>
                          <button onClick={() => startEdit(res)} className="p-2 rounded-lg border-2 border-line hover:bg-accent hover:text-accent-contrast hover:border-accent transition-all" aria-label="Edit resource">
                            <Edit3 className="w-4 h-4" aria-hidden />
                          </button>
                          <button onClick={() => handleDeleteResource(res.id, res.title)} className="p-2 rounded-lg border-2 border-line hover:bg-red-500 hover:text-white hover:border-red-500 transition-all" aria-label="Delete resource">
                            <Trash2 className="w-4 h-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* ===== SECURITY ===== */}
      {activeTab === "security" && (
        <div className="space-y-6">
          {/* Auto-block alert banner — system blocks from the last 7 days */}
          {autoBlocks.length > 0 && (
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-6">
              <h3 className="font-black text-lg text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" aria-hidden />
                {autoBlocks.length} IP{autoBlocks.length > 1 ? "s" : ""} auto-blocked by the system (last 7 days)
              </h3>
              <p className="text-sm font-medium text-red-600/80 mt-1">
                Detected attack patterns triggered these (VPN/proxy use is never auto-blocked). If a whole
                campus shares one IP, one false positive locks everyone out — review and unblock if needed.
              </p>
              <div className="mt-4 space-y-2">
                {autoBlocks.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 py-2 border-b border-red-200/60 last:border-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">{b.ip}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-red-100 text-red-700 border-red-300">
                          Attack
                        </span>
                      </div>
                      <p className="text-xs text-red-600/70 font-medium truncate">{b.reason}</p>
                    </div>
                    <button
                      onClick={() => handleUnblockIp(b.ip)}
                      className="shrink-0 px-3 py-1.5 rounded-full border-2 border-red-300 text-xs font-bold text-red-700 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleBlockIp} noValidate className="bg-surface-muted rounded-2xl p-6 border-2 border-line">
            <h3 className="font-bold text-lg mb-4">Block an IP address</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="IP address" className="w-full sm:w-auto sm:flex-1 h-12 sm:h-14 px-4 rounded-xl border-2 border-ink bg-surface text-base sm:text-sm font-medium focus:outline-none focus:shadow-hard-sm transition-all" />
              <input type="text" value={newIpReason} onChange={(e) => setNewIpReason(e.target.value)} placeholder="Reason" className="w-full sm:w-auto sm:flex-1 h-12 sm:h-14 px-4 rounded-xl border-2 border-ink bg-surface text-base sm:text-sm font-medium focus:outline-none focus:shadow-hard-sm transition-all" />
              <button type="submit" className="w-full sm:w-auto h-12 sm:h-14 px-6 rounded-full bg-ink on-ink font-bold text-sm tracking-wider hover:-translate-y-0.5 transition-all">Block</button>
            </div>
          </form>

          {blockedIps.length === 0 ? (
            <div className="text-center py-16 bg-surface-muted rounded-2xl border-2 border-dashed border-line">
              <Globe className="w-12 h-12 mx-auto text-foreground/40 mb-4" aria-hidden />
              <p className="text-foreground/60 font-medium">No blocked IPs</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blockedIps.map((entry) => {
                const blockType = entry.blockedBy === "system" ? "attack" : "manual";
                const badgeColor = blockType === "attack" ? "bg-red-100 text-red-700 border-red-300" : "bg-surface-muted text-foreground border-line";
                const badgeLabel = blockType === "attack" ? "Attack" : "Manual";
                return (
                  <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-2 border-line bg-surface hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-500" aria-hidden />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm font-mono">{entry.ip}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${badgeColor}`}>{badgeLabel}</span>
                        </div>
                        <p className="text-xs text-foreground/60 font-medium">{entry.reason}</p>
                        <p className="text-xs text-foreground/70 font-medium">By {entry.blockedBy} · {new Date(entry.blockedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <button onClick={() => handleUnblockIp(entry.ip)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-ink text-sm font-bold hover:bg-accent hover:text-accent-contrast hover:border-accent transition-all">
                      <Trash2 className="w-4 h-4" aria-hidden /> Unblock
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== USERS (includes admin management) ===== */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <form onSubmit={handleAddAdmin} noValidate className="bg-surface-muted rounded-2xl p-6 border-2 border-line">
            <h3 className="font-bold text-lg mb-4">Add admin by email</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="Email address" className="w-full sm:w-auto sm:flex-1 h-12 sm:h-14 px-4 rounded-xl border-2 border-ink bg-surface text-base sm:text-sm font-medium focus:outline-none focus:shadow-hard-sm transition-all" />
              <button type="submit" className="w-full sm:w-auto h-12 sm:h-14 px-6 rounded-full bg-ink on-ink font-bold text-sm tracking-wider hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" aria-hidden /> Add Admin
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {usersList.length === 0 ? (
              <div className="text-center py-16 bg-surface-muted rounded-2xl border-2 border-dashed border-line">
                <Users className="w-12 h-12 mx-auto text-foreground/40 mb-4" aria-hidden />
                <p className="text-foreground/60 font-medium">No users yet</p>
              </div>
            ) : (
              usersList.map((u) => {
                const isUserAdmin = adminEmails.some((a) => a.email.toLowerCase() === u.email.toLowerCase());
                const isPermanent = isPermanentAdmin(u.email);
                const providerChips = u.providers.length > 0 ? u.providers : ["credentials"];
                return (
                  <div key={u.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-2 border-line bg-surface">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar image={u.image} name={u.name} email={u.email} size={40} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm truncate">{u.name || "Student"}</p>
                          {isUserAdmin && (isPermanent ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">Owner · Admin</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-accent/15 text-accent border border-accent/30">Admin</span>
                          ))}
                          {!u.emailVerified && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">Unverified</span>
                          )}
                          {providerChips.map((p) => (
                            <span key={p} className="px-2 py-0.5 rounded-full text-xs font-bold bg-surface-muted text-foreground border border-line">
                              {p === "credentials" ? "Email" : p === "github" ? "GitHub" : p === "google" ? "Google" : p}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-foreground/60 font-medium truncate">{u.email}</p>
                        <p className="text-xs text-foreground/70 font-medium">
                          {u.resourceCount} resource{u.resourceCount === 1 ? "" : "s"} · Joined {new Date(u.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                      {isUserAdmin ? (
                        isPermanent ? (
                          <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-foreground/60">
                            <Lock className="w-3.5 h-3.5" aria-hidden /> Permanent
                          </span>
                        ) : (
                          <button onClick={() => handleDemoteUser(u.email)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-ink text-sm font-bold hover:bg-surface-muted transition-all">
                            <ShieldOff className="w-4 h-4" aria-hidden /> Remove Admin
                          </button>
                        )
                      ) : (
                        <button onClick={() => handlePromoteUser(u.email)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-ink text-sm font-bold hover:bg-accent hover:text-accent-contrast hover:border-accent transition-all">
                          <ShieldCheck className="w-4 h-4" aria-hidden /> Make Admin
                        </button>
                      )}
                      {!isPermanent && (
                        <button onClick={() => handleDeleteUser(u.id, u.email)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-red-300 text-red-600 text-sm font-bold hover:bg-red-500 hover:text-white hover:border-red-500 transition-all">
                          <Trash2 className="w-4 h-4" aria-hidden /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===== DIAGNOSTICS (email health + traffic) ===== */}
      {activeTab === "diagnostics" && (
        <div className="space-y-10">
          <section>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4" aria-hidden /> Email health
            </h3>
            {!emailStats ? (
              <p className="text-sm text-foreground/60 font-medium p-4 rounded-xl bg-surface-muted">
                Email tracking not configured. Add RESEND_WEBHOOK_SECRET to enable.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { label: "Sent", value: emailStats.totals.sent, color: "bg-blue-50 border-blue-200" },
                    { label: "Delivered", value: emailStats.totals.delivered, color: "bg-green-50 border-green-200" },
                    { label: "Bounced", value: emailStats.totals.bounced, color: "bg-red-50 border-red-200" },
                    { label: "Complaints", value: emailStats.totals.complained, color: "bg-orange-50 border-orange-200" },
                    { label: "Opened", value: emailStats.totals.opened, color: "bg-purple-50 border-purple-200" },
                    { label: "Clicked", value: emailStats.totals.clicked, color: "bg-cyan-50 border-cyan-200" },
                  ].map((m) => (
                    <div key={m.label} className={`rounded-2xl border-2 p-5 ${m.color}`}>
                      <p className="text-xs font-bold text-foreground/60 tracking-wider uppercase">{m.label}</p>
                      <p className="text-3xl font-black tracking-tight mt-1">{m.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border-2 border-line bg-surface p-6">
                  <h4 className="font-bold mb-3">Recent failures (last 30 days)</h4>
                  {emailStats.recentFailures.length === 0 ? (
                    <p className="text-foreground/60 font-medium text-sm">No failures recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {emailStats.recentFailures.map((f) => (
                        <div key={f.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                              f.eventType === "email.bounced" ? "bg-red-100 text-red-700 border-red-200" : "bg-orange-100 text-orange-700 border-orange-200"
                            }`}>{f.eventType === "email.bounced" ? "Bounce" : "Complaint"}</span>
                            <span className="text-sm font-medium">{f.to}</span>
                          </div>
                          <span className="text-xs text-foreground/60 font-medium">{new Date(f.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Gauge className="h-4 w-4" aria-hidden /> Core Web Vitals
            </h3>
            <VitalsTab />
          </section>

          <section>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Eye className="h-4 w-4" aria-hidden /> Traffic
            </h3>
            <TrafficTab />
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmState !== null}
        title={
          confirmState?.type === "user"
            ? "Delete this account?"
            : confirmState?.type === "reported"
              ? "Delete reported resource?"
              : "Delete this resource?"
        }
        message={
          confirmState?.type === "user"
            ? `The account ${confirmState?.email} and everything it uploaded will be permanently removed. This cannot be undone.`
            : confirmState?.type === "reported"
              ? `"${confirmState?.title}" will be deleted and all reports against it dismissed. This cannot be undone.`
              : `"${confirmState?.title}" will be permanently deleted. This cannot be undone.`
        }
        busy={isConfirming}
        busyLabel="Deleting…"
        onConfirm={executeConfirmedDelete}
        onCancel={() => !isConfirming && setConfirmState(null)}
      />
    </div>
  );
}
