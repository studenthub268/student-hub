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
  UserCog,
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
} from "lucide-react";
import Link from "next/link";
import { getErrorMessage } from "@/lib/utils";
import { isPermanentAdmin } from "@/lib/constants";
import type { BlockedIp, AdminEmail, Message } from "@/lib/db/schema";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type Tab = "security" | "resources" | "reports" | "messages" | "users" | "admins" | "email";

// sessionStorage cache so revisits within the same tab render instantly and
// revalidate in the background. Stale-while-revalidate: cached data shows
// immediately, fresh data replaces it when the server responds.
const ADMIN_CACHE_KEY = "admin-panel-cache-v2";
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
  const [activeTab, setActiveTab] = useState<Tab>("security");
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

  const handleRemoveAdmin = async (email: string) => {
    try {
      await removeAdminEmail(email);
      toast.success(`Removed ${email}`);
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  // ---- User Management ----
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
        <div className="w-10 h-10 border-4 border-black/10 border-t-[#0D9488] rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "security", label: "Security", icon: Shield, count: blockedIps.length },
    { key: "resources", label: "Resources", icon: FileText, count: resourcesList.length },
    { key: "reports", label: "Reports", icon: Flag, count: reportsList.length },
    { key: "messages", label: "Messages", icon: Mail, count: messagesList.length },
    { key: "users", label: "Users", icon: UserCog, count: usersList.length },
    { key: "admins", label: "Admins", icon: ShieldCheck, count: adminEmails.length },
    { key: "email", label: "Email", icon: Mail, count: emailStats?.totals?.bounced || 0 },
  ];

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Admin Panel</h1>
        <p className="text-black/50 font-medium">Manage security, resources, messages, and admin access.</p>
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
                  ? "bg-[#111] text-white"
                  : "bg-gray-100 text-black hover:bg-gray-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key ? "bg-white/20" : "bg-black/10"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===== SECURITY TAB ===== */}
      {activeTab === "security" && (
        <div className="space-y-6">
          {/* Auto-block alert banner — system blocks from the last 7 days */}
          {autoBlocks.length > 0 && (
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-6">
              <h3 className="font-black text-lg text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
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
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-red-100 text-red-700 border-red-300">
                          Attack
                        </span>
                      </div>
                      <p className="text-xs text-red-600/70 font-medium truncate">{b.reason}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-red-400 font-medium">
                        {new Date(b.blockedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <button
                        onClick={() => handleUnblockIp(b.ip)}
                        className="px-3 py-1.5 rounded-full border-2 border-red-300 text-xs font-bold text-red-700 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                      >
                        Unblock
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleBlockIp} noValidate className="bg-gray-50 rounded-2xl p-6 border-2 border-black/5">
            <h3 className="font-bold text-lg mb-4">Block an IP address</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="IP address" className="w-full sm:w-auto sm:flex-1 h-12 sm:h-14 px-4 rounded-xl border-2 border-black bg-white text-base sm:text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_#111] transition-all" />
              <input type="text" value={newIpReason} onChange={(e) => setNewIpReason(e.target.value)} placeholder="Reason" className="w-full sm:w-auto sm:flex-1 h-12 sm:h-14 px-4 rounded-xl border-2 border-black bg-white text-base sm:text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_#111] transition-all" />
              <button type="submit" className="w-full sm:w-auto h-12 sm:h-14 px-6 rounded-full bg-[#111] text-white font-bold text-sm tracking-wider hover:-translate-y-0.5 transition-all">Block</button>
            </div>
          </form>

          {blockedIps.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-black/10">
              <Globe className="w-12 h-12 mx-auto text-black/20 mb-4" />
              <p className="text-black/40 font-medium">No blocked IPs</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blockedIps.map((entry) => {
                const blockType = entry.blockedBy === "system" ? "attack" : "manual";
                const badgeColor = blockType === "attack" ? "bg-red-100 text-red-700 border-red-300" : "bg-gray-100 text-gray-700 border-gray-300";
                const badgeLabel = blockType === "attack" ? "Attack" : "Manual";
                return (
                  <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-2 border-black/5 bg-white hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm font-mono">{entry.ip}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}>{badgeLabel}</span>
                        </div>
                        <p className="text-xs text-black/50 font-medium">{entry.reason}</p>
                        <p className="text-xs text-black/30 font-medium">By {entry.blockedBy} · {new Date(entry.blockedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <button onClick={() => handleUnblockIp(entry.ip)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-black text-sm font-bold hover:bg-[#0D9488] hover:border-[#0D9488] transition-all">
                      <Trash2 className="w-4 h-4" /> Unblock
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== RESOURCES TAB ===== */}
      {activeTab === "resources" && (
        <div className="space-y-3">
          {resourcesList.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-black/10">
              <FileText className="w-12 h-12 mx-auto text-black/20 mb-4" />
              <p className="text-black/40 font-medium">No resources yet</p>
            </div>
          ) : (
            resourcesList.map((res) => (
                  <div key={res.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-2 border-black/5 bg-white">
                {editingResource === res.id ? (
                  /* Edit mode */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-sm">Editing resource</h4>
                      <button onClick={() => setEditingResource(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full h-10 px-3 rounded-lg border-2 border-black/10 text-sm font-medium focus:outline-none" placeholder="Title" />
                    <input value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} className="w-full h-10 px-3 rounded-lg border-2 border-black/10 text-sm font-medium focus:outline-none" placeholder="Subject" />
                    <input value={editForm.professor} onChange={(e) => setEditForm({ ...editForm, professor: e.target.value })} className="w-full h-10 px-3 rounded-lg border-2 border-black/10 text-sm font-medium focus:outline-none" placeholder="Professor" />
                    <input value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} className="w-full h-10 px-3 rounded-lg border-2 border-black/10 text-sm font-medium focus:outline-none" placeholder="Department" />
                    <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="w-full h-20 px-3 py-2 rounded-lg border-2 border-black/10 text-sm font-medium focus:outline-none resize-none" placeholder="Description" />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEdit(res.id)} className="px-4 py-2 rounded-full bg-[#0D9488] text-black font-bold text-xs tracking-wider">Save</button>
                      <button onClick={() => setEditingResource(null)} className="px-4 py-2 rounded-full bg-gray-100 font-bold text-xs tracking-wider">Cancel</button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div className="flex items-center justify-between w-full">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{res.title}</p>
                      <p className="text-xs text-black/50 font-medium mt-0.5">
                        {res.subject} · {res.type} · {res.uploader?.name || "Anonymous"}
                      </p>
                      <p className="text-xs text-black/30 font-medium">
                        {res.likes} likes · {new Date(res.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                      <Link href={`/resource/${res.id}`} target="_blank" className="p-2 rounded-lg border-2 border-black/10 hover:bg-gray-100 transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                      <button onClick={() => startEdit(res)} className="p-2 rounded-lg border-2 border-black/10 hover:bg-[#0D9488] hover:border-[#0D9488] transition-all">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteResource(res.id, res.title)} className="p-2 rounded-lg border-2 border-black/10 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ===== REPORTS TAB ===== */}
      {activeTab === "reports" && (
        <div className="space-y-3">
          {reportsList.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-black/10">
              <Flag className="w-12 h-12 mx-auto text-black/20 mb-4" />
              <p className="text-black/40 font-medium">No reports yet</p>
            </div>
          ) : (
            reportsList.map((report) => {
              const reportedResource = report.resource;
              return (
              <div key={report.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 rounded-xl border-2 border-red-100 bg-white">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">Report</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">{report.reason}</span>
                    </div>
                    <p className="font-bold text-sm mt-1">Resource: {reportedResource?.title || "Deleted"}</p>
                    <p className="text-xs text-black/50 font-medium mt-0.5">
                      Reported by {report.reporter?.name || "Unknown"} ({report.reporter?.email})
                    </p>
                    <p className="text-xs text-black/40 font-medium mt-0.5">{new Date(report.createdAt).toLocaleDateString()}</p>
                    {report.description && (
                      <p className="text-xs text-black/60 font-medium mt-2 p-3 bg-gray-50 rounded-lg">{report.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                    {reportedResource?.id && (
                      <Link href={`/resource/${reportedResource.id}`} target="_blank" className="p-2 rounded-lg border-2 border-black/10 hover:bg-gray-100 transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    )}
                    {reportedResource?.id && (
                      <button
                        onClick={() => handleDeleteReportedResource(report.id, reportedResource!.id, reportedResource!.title)}
                        className="p-2 rounded-lg border-2 border-red-200 text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all"
                        title="Delete resource & dismiss report"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteReport(report.id)}
                      className="p-2 rounded-lg border-2 border-black/10 hover:bg-gray-100 transition-colors"
                      title="Dismiss report only"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
              </div>
              );
            })
          )}
        </div>
      )}

      {/* ===== MESSAGES TAB ===== */}
      {activeTab === "messages" && (
        <div className="space-y-3">
          {messagesList.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-black/10">
              <Mail className="w-12 h-12 mx-auto text-black/20 mb-4" />
              <p className="text-black/40 font-medium">No messages yet</p>
            </div>
          ) : (
            messagesList.map((msg) => (
              <div key={msg.id} className="p-4 rounded-xl border-2 border-black/5 bg-white">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedMessage(expandedMessage === msg.id ? null : msg.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#0D9488]/10 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 text-[#0D9488]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{msg.name}</p>
                        <p className="text-xs text-black/40 font-medium">{msg.email}</p>
                      </div>
                    </div>
                    {expandedMessage !== msg.id && (
                      <p className="text-xs text-black/50 font-medium mt-2 ml-11 truncate">{msg.message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                    <span className="text-xs text-black/30 font-medium">{new Date(msg.createdAt).toLocaleDateString()}</span>
                    {expandedMessage === msg.id ? <ChevronUp className="w-4 h-4 text-black/30" /> : <ChevronDown className="w-4 h-4 text-black/30" />}
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id); }} className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {expandedMessage === msg.id && (
                  <div className="mt-4 ml-11 p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm font-medium text-black/70 whitespace-pre-wrap">{msg.message}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ===== USERS TAB ===== */}
      {activeTab === "users" && (
        <div className="space-y-3">
          {usersList.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-black/10">
              <Users className="w-12 h-12 mx-auto text-black/20 mb-4" />
              <p className="text-black/40 font-medium">No users yet</p>
            </div>
          ) : (
            usersList.map((u) => {
              const isUserAdmin = adminEmails.some((a) => a.email.toLowerCase() === u.email.toLowerCase());
              const isPermanent = isPermanentAdmin(u.email);
              const providerChips = u.providers.length > 0 ? u.providers : ["credentials"];
              return (
                <div key={u.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-2 border-black/5 bg-white">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar image={u.image} name={u.name} email={u.email} size={40} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm truncate">{u.name || "Student"}</p>
                        {isUserAdmin && (isPermanent ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300">Owner · Admin</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0D9488]/15 text-[#0D9488] border border-[#0D9488]/30">Admin</span>
                        ))}
                        {!u.emailVerified && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">Unverified</span>
                        )}
                        {providerChips.map((p) => (
                          <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                            {p === "credentials" ? "Email" : p === "github" ? "GitHub" : p === "google" ? "Google" : p}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-black/50 font-medium truncate">{u.email}</p>
                      <p className="text-xs text-black/30 font-medium">
                        {u.resourceCount} resource{u.resourceCount === 1 ? "" : "s"} · Joined {new Date(u.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                    {isUserAdmin ? (
                      isPermanent ? (
                        <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-black/40">
                          <Lock className="w-3.5 h-3.5" /> Permanent
                        </span>
                      ) : (
                        <button onClick={() => handleDemoteUser(u.email)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-black text-sm font-bold hover:bg-gray-100 transition-all">
                          <ShieldOff className="w-4 h-4" /> Remove Admin
                        </button>
                      )
                    ) : (
                      <button onClick={() => handlePromoteUser(u.email)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-black text-sm font-bold hover:bg-[#0D9488] hover:border-[#0D9488] transition-all">
                        <ShieldCheck className="w-4 h-4" /> Make Admin
                      </button>
                    )}
                    {!isPermanent && (
                      <button onClick={() => handleDeleteUser(u.id, u.email)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-red-300 text-red-600 text-sm font-bold hover:bg-red-500 hover:text-white hover:border-red-500 transition-all">
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ===== ADMINS TAB ===== */}
      {activeTab === "admins" && (
        <div className="space-y-6">
          <form onSubmit={handleAddAdmin} noValidate className="bg-gray-50 rounded-2xl p-6 border-2 border-black/5">
            <h3 className="font-bold text-lg mb-4">Add admin</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="Email address" className="w-full sm:w-auto sm:flex-1 h-12 sm:h-14 px-4 rounded-xl border-2 border-black bg-white text-base sm:text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_#111] transition-all" />
              <button type="submit" className="w-full sm:w-auto h-12 sm:h-14 px-6 rounded-full bg-[#111] text-white font-bold text-sm tracking-wider hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Admin
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {adminEmails.map((admin) => {
              const permanent = isPermanentAdmin(admin.email);
              return (
                <div key={admin.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-2 border-black/5 bg-white">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm">{admin.email}</p>
                      {permanent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300">Owner</span>
                      )}
                    </div>
                    <p className="text-xs text-black/40 font-medium">Added {new Date(admin.addedAt).toLocaleDateString()}</p>
                  </div>
                  {permanent ? (
                    <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-black/40">
                      <Lock className="w-3.5 h-3.5" /> Permanent
                    </span>
                  ) : (
                    <button onClick={() => handleRemoveAdmin(admin.email)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-black text-sm font-bold hover:bg-red-500 hover:text-white hover:border-red-500 transition-all">
                      <Trash2 className="w-4 h-4" /> Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== EMAIL TAB ===== */}
      {activeTab === "email" && (
        <div className="space-y-6">
          {!emailStats ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-black/10">
              <Mail className="w-12 h-12 mx-auto text-black/20 mb-4" />
              <p className="text-black/40 font-medium">Email tracking not configured. Add RESEND_WEBHOOK_SECRET to enable.</p>
            </div>
          ) : (
            <>
              {/* Metric cards */}
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
                    <p className="text-xs font-bold text-black/50 tracking-wider uppercase">{m.label}</p>
                    <p className="text-3xl font-black tracking-tight mt-1">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Rate cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border-2 border-black/5 bg-white p-5">
                  <p className="text-xs font-bold text-black/50 tracking-wider uppercase">Delivery Rate</p>
                  <p className="text-3xl font-black tracking-tight mt-1">{emailStats.totals.deliveryRate}%</p>
                </div>
                <div className="rounded-2xl border-2 border-black/5 bg-white p-5">
                  <p className="text-xs font-bold text-black/50 tracking-wider uppercase">Bounce Rate</p>
                  <p className={`text-3xl font-black tracking-tight mt-1 ${Number(emailStats.totals.bounceRate) > 5 ? "text-red-600" : ""}`}>{emailStats.totals.bounceRate}%</p>
                </div>
                <div className="rounded-2xl border-2 border-black/5 bg-white p-5">
                  <p className="text-xs font-bold text-black/50 tracking-wider uppercase">Open Rate</p>
                  <p className="text-3xl font-black tracking-tight mt-1">{emailStats.totals.openRate}%</p>
                </div>
              </div>

              {/* Suppressed emails */}
              <div className="rounded-2xl border-2 border-black/5 bg-white p-6">
                <h3 className="font-bold text-lg mb-4">Suppressed Emails ({emailStats.suppressedCount})</h3>
                {emailStats.recentSuppressions.length === 0 ? (
                  <p className="text-black/40 font-medium text-sm">No suppressed addresses</p>
                ) : (
                  <div className="space-y-2">
                    {emailStats.recentSuppressions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-bold">{s.email}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            s.reason === "bounced" ? "bg-red-100 text-red-700 border-red-200" : "bg-orange-100 text-orange-700 border-orange-200"
                          }`}>{s.reason}</span>
                        </div>
                        <span className="text-xs text-black/40 font-medium">{new Date(s.suppressedAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent failures */}
              <div className="rounded-2xl border-2 border-black/5 bg-white p-6">
                <h3 className="font-bold text-lg mb-4">Recent Failures (last 30 days)</h3>
                {emailStats.recentFailures.length === 0 ? (
                  <p className="text-black/40 font-medium text-sm">No failures recorded</p>
                ) : (
                  <div className="space-y-2">
                    {emailStats.recentFailures.map((f) => (
                      <div key={f.id} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            f.eventType === "email.bounced" ? "bg-red-100 text-red-700 border-red-200" : "bg-orange-100 text-orange-700 border-orange-200"
                          }`}>{f.eventType === "email.bounced" ? "Bounce" : "Complaint"}</span>
                          <span className="text-sm font-medium">{f.to}</span>
                          {f.subject && <span className="text-xs text-black/40 font-medium truncate max-w-[200px]">{f.subject}</span>}
                        </div>
                        <span className="text-xs text-black/40 font-medium">{new Date(f.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
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
