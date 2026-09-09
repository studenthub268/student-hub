"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, AlertTriangle, ChevronRight, FileText, Send, CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { submitReport } from "@/lib/actions/reports";
import { searchResourceSuggestions, getResourceById } from "@/lib/actions/search";
import { getErrorMessage } from "@/lib/utils";

interface ResourceOption {
  id: string;
  title: string;
  subject: string | null;
  professor: string | null;
}

function ReportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedId = searchParams.get("resourceId");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceOption | null>(null);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);

  useEffect(() => {
    if (preselectedId) {
      const fetchPreselected = async () => {
        const resource = await getResourceById(preselectedId);
        if (resource) setSelectedResource(resource);
      };
      fetchPreselected();
    }
  }, [preselectedId]);

  useEffect(() => {
    const search = async () => {
      if (searchQuery.length < 2) { setResources([]); return; }
      setLoadingResources(true);
      try {
        const results = await searchResourceSuggestions(searchQuery);
        if (results) setResources(results);
      } catch (e) { console.error("Search error:", e); }
      setLoadingResources(false);
    };
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource || !reason || !description) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitReport({
        resource_id: selectedResource.id,
        reason,
        description,
      });

      setIsSuccess(true);
      toast.success("Report submitted successfully");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to submit report"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500">
        <div className="h-24 w-24 bg-[#0D9488] rounded-full border-4 border-black flex items-center justify-center mb-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <CheckCircle size={48} />
        </div>
        <h2 className="text-4xl font-black tracking-tighter mb-4">Report Received</h2>
        <p className="text-lg text-black/60 font-medium max-w-md mx-auto mb-10">
          Thank you for helping us keep Student-Hub safe. Our team will review this resource within 48 hours.
        </p>
        <button 
          onClick={() => router.push("/")}
          className="px-12 py-4 bg-black text-white rounded-full font-bold tracking-wider hover:-translate-y-1 transition-all shadow-[4px_4px_0px_0px_#0D9488]"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
      
      {/* Left side: Selector */}
      <div className="lg:col-span-5 space-y-8">
        <div className="p-8 bg-white border-4 border-black rounded-[2.5rem] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-2xl font-black tracking-tight mb-6 flex items-center gap-2">
            <Search size={24} /> 1. Select Resource
          </h2>
          
          {selectedResource ? (
            <div className="p-6 bg-[#0D9488] border-2 border-black rounded-2xl relative group">
              <button 
                onClick={() => setSelectedResource(null)}
                className="absolute -top-3 -right-3 h-8 w-8 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold border-2 border-white hover:scale-110 transition-transform"
              >
                ✕
              </button>
              <div className="flex gap-4">
                <FileText className="flex-shrink-0" />
                <div>
                  <p className="font-black text-sm line-clamp-1">{selectedResource.title}</p>
                  <p className="text-xs font-bold opacity-60">{selectedResource.subject}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search to find resource..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-4 border-2 border-black rounded-xl outline-none focus:bg-gray-50 transition-colors font-bold text-xs tracking-wider"
                />
                {loadingResources && (
                  <Loader2 className="absolute right-4 top-4 animate-spin text-black/40" size={16} />
                )}
              </div>
              
              <div className="space-y-2">
                {resources.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedResource(r)}
                    className="w-full p-4 border-2 border-black rounded-xl flex items-center justify-between hover:bg-gray-50 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <FileText size={16} className="text-black/40" />
                      <span className="text-sm font-bold tracking-tight line-clamp-1">{r.title}</span>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))}
                {searchQuery.length >= 2 && resources.length === 0 && !loadingResources && (
                  <p className="text-center text-xs font-bold text-black/40 py-4">No resources found</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-8 bg-[#111] text-white rounded-[2.5rem] shadow-[8px_8px_0px_0px_rgba(217,249,157,0.3)]">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="text-[#0D9488]" /> Reporting Policy
          </h3>
          <p className="text-sm text-white/60 font-medium leading-relaxed">
            Please only report resources that violate copyright, contain inappropriate content, or are academically dishonest. False reporting may lead to account restrictions.
          </p>
        </div>
      </div>

      {/* Right side: Form */}
      <div className="lg:col-span-7">
        <form onSubmit={handleSubmit} noValidate className="p-8 sm:p-10 bg-white border-4 border-black rounded-[3rem] shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] space-y-8">
          <h2 className="text-3xl font-black tracking-tighter mb-4 flex items-center gap-3">
            <div className="h-10 w-10 bg-black text-[#0D9488] rounded-full flex items-center justify-center text-xl">2</div>
            Report Details
          </h2>

          <div className="space-y-4">
            <label className="text-xs font-black tracking-wider text-black/40 block">Reason for reporting</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                "Copyright Infringement",
                "Inappropriate Content",
                "Academically Dishonest",
                "Wrong Subject/Category",
                "Corrupted File",
                "Other"
              ].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`p-4 border-2 rounded-2xl text-sm font-bold tracking-tight text-center transition-all ${
                    reason === r 
                      ? "bg-black text-white border-black" 
                      : "bg-white text-black border-black/10 hover:border-black"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-black tracking-wider text-black/40 block">Additional Details</label>
            <textarea
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide more context about the issue..."
              className="w-full p-6 border-2 border-black rounded-[2rem] outline-none focus:bg-gray-50 transition-colors font-medium text-black placeholder:text-black/20"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !selectedResource || !reason}
            className="w-full py-4 sm:py-6 bg-black text-white rounded-full font-black tracking-wider sm:tracking-[0.2em] text-lg sm:text-xl flex items-center justify-center gap-4 hover:bg-neutral-800 transition-all disabled:opacity-20 shadow-[8px_8px_0px_0px_#0D9488] active:translate-y-1 active:shadow-none"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <Send size={24} /> Submit Report
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-[#0D9488]">
      <div className="max-w-[1200px] mx-auto px-4 py-16">
        
        {/* Header */}
        <div className="mb-16">
          <h1 className="text-5xl sm:text-7xl font-black tracking-tighter mb-4 leading-none">
            Report an <span className="text-red-500">Issue</span>
          </h1>
          <p className="text-xl font-bold tracking-tight text-black/40">Help us maintain the integrity of Student-Hub.</p>
        </div>

        <Suspense fallback={<div className="py-20 text-center font-black tracking-widest animate-pulse">Loading Report Center...</div>}>
          <ReportContent />
        </Suspense>

        <div className="mt-20 text-center">
          <Link href="/contact" className="text-sm font-bold tracking-wider text-black/40 hover:text-black transition-colors underline underline-offset-8">
            Need direct help? Contact us instead
          </Link>
        </div>
      </div>
    </div>
  );
}
