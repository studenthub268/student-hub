"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getBlockedIps,
  unblockIp,
  blockIp,
  getAdminEmails,
  addAdminEmail,
  removeAdminEmail,
  getAllResources,
  adminDeleteResource,
  adminUpdateResource,
  getAllMessages,
  deleteMessage,
  getAllReports,
  deleteReport,
  dismissReportAndDeleteResource,
  getEmailHealthStats,
  getRecentAutoBlocks,
} from "@/lib/actions/admin";
import { toast } from "react-hot-toast";
import {
  Shield,
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
} from "lucide-react";
import Link from "next/link";
import { getErrorMessage } from "@/lib/utils";
import type { BlockedIp, AdminEmail, Message } from "@/lib/db/schema";
import type { LucideIcon } from "lucide-react";

type Tab = "security" | "resources" | "reports" | "messages" | "admins" | "email";

interface AdminResource {
  id: string;
  title: string;
  description: string | null;
  type: string;
  subject: string;
  department: string | null;
  professor: string | null;
  downloads: number;
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

export default function AdminPanel() {
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [adminEmails, setAdminEmails] = useState<AdminEmail[]>([]);
  const [resourcesList, setResourcesList] = useState<AdminResource[]>([]);
  const [messagesList, setMessagesList] = useState<Message[]>([]);
  const [reportsList, setReportsList] = useState<AdminReport[]>([]);
  const [newIp, setNewIp] = useState("");
  const [newIpReason, setNewIpReason] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("security");
  const [editingResource, setEditingResource] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", subject: "", type: "", professor: "", department: "" });
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [autoBlocks, setAutoBlocks] = useState<AutoBlock[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [ips, admins, resources, messages, reportList, emailData, recentAutoBlocks] = await Promise.all([
        getBlockedIps(),
        getAdminEmails(),
        getAllResources(),
        getAllMessages(),
        getAllReports(),
        getEmailHealthStats().catch(() => null),
        getRecentAutoBlocks().catch(() => []),
      ]);
      setBlockedIps(ips);
      setAdminEmails(admins);
      setResourcesList(resources);
      setMessagesList(messages);
      setReportsList(reportList);
      setEmailStats(emailData);
      setAutoBlocks(recentAutoBlocks);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load admin data"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // loadData is async (all state updates occur after await) and is also
    // reused by event handlers to refresh after mutations.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
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
  const handleDeleteResource = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await adminDeleteResource(id);
      toast.success("Resource deleted");
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
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

  const handleDeleteReportedResource = async (reportId: string, resourceId: string, title: string) => {
    if (!confirm(`Delete reported resource "${title}"? This will also dismiss all reports for it.`)) return;
    try {
      await dismissReportAndDeleteResource(reportId, resourceId);
      toast.success("Resource deleted and report dismissed");
      loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
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
    { key: "admins", label: "Admins", icon: Users, count: adminEmails.length },
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

          <form onSubmit={handleBlockIp} className="bg-gray-50 rounded-2xl p-6 border-2 border-black/5">
            <h3 className="font-bold text-lg mb-4">Block an IP address</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="IP address" className="flex-1 h-12 px-4 rounded-xl border-2 border-black bg-white text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_#111] transition-all" />
              <input type="text" value={newIpReason} onChange={(e) => setNewIpReason(e.target.value)} placeholder="Reason" className="flex-1 h-12 px-4 rounded-xl border-2 border-black bg-white text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_#111] transition-all" />
              <button type="submit" className="h-12 px-6 rounded-full bg-[#111] text-white font-bold text-sm tracking-wider hover:-translate-y-0.5 transition-all">Block</button>
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
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{res.title}</p>
                      <p className="text-xs text-black/50 font-medium mt-0.5">
                        {res.subject} · {res.type} · {res.uploader?.name || "Anonymous"}
                      </p>
                      <p className="text-xs text-black/30 font-medium">
                        {res.downloads} downloads · {res.likes} likes · {new Date(res.createdAt).toLocaleDateString()}
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

      {/* ===== ADMINS TAB ===== */}
      {activeTab === "admins" && (
        <div className="space-y-6">
          <form onSubmit={handleAddAdmin} className="bg-gray-50 rounded-2xl p-6 border-2 border-black/5">
            <h3 className="font-bold text-lg mb-4">Add admin</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="Email address" className="flex-1 h-12 px-4 rounded-xl border-2 border-black bg-white text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_#111] transition-all" />
              <button type="submit" className="h-12 px-6 rounded-full bg-[#111] text-white font-bold text-sm tracking-wider hover:-translate-y-0.5 transition-all flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Admin
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {adminEmails.map((admin) => (
              <div key={admin.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border-2 border-black/5 bg-white">
                <div>
                  <p className="font-bold text-sm">{admin.email}</p>
                  <p className="text-xs text-black/40 font-medium">Added {new Date(admin.addedAt).toLocaleDateString()}</p>
                </div>
                <button onClick={() => handleRemoveAdmin(admin.email)} className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-black text-sm font-bold hover:bg-red-500 hover:text-white hover:border-red-500 transition-all">
                  <Trash2 className="w-4 h-4" /> Remove
                </button>
              </div>
            ))}
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
    </div>
  );
}
