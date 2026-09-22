"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  notify,
  requestNotificationPermission,
} from "@/lib/notify";
import { SUBJECTS, RESOURCE_TYPES, DEPARTMENTS } from "@/lib/constants";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from "@/lib/uploads";
import { formatFileSize, getErrorMessage } from "@/lib/utils";
import { uploadResource, checkDuplicateResources } from "@/lib/actions/resources";
import Link from "next/link";

export default function UploadForm() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("");
  const [professor, setProfessor] = useState("");
  const [department, setDepartment] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [duplicates, setDuplicates] = useState<{ id: string; title: string; subject: string; department: string | null; uploader: { name: string | null } | null }[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      // A newly picked file is a new logical upload — never reuse the key.
      uploadIdRef.current = crypto.randomUUID();
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Reject oversized files at the drop, with the reason — the server would
    // reject them anyway, and a silent no-op on drop looks like a broken page.
    maxSize: MAX_FILE_SIZE,
    onDropRejected: (rejections) => {
      const tooLarge = rejections.some((r) => r.errors.some((e) => e.code === "file-too-large"));
      toast.error(
        tooLarge
          ? `That file is over ${MAX_FILE_SIZE_MB}MB — please upload a smaller file.`
          : "That file type isn't supported. Use PDF, PNG, JPG or DOCX."
      );
    },
    maxFiles: 1,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    }
  });

  const [uploadProgress, setUploadProgress] = useState(0);

  // Idempotency key: one stable UUID per logical upload, shared by the file
  // PUT and the resource insert. A retry after a lost response (flaky mobile
  // network, tab closed at "Saving resource…") dedupes server-side instead of
  // saving the resource twice. A newly picked file starts a new upload.
  const uploadIdRef = useRef<string>(crypto.randomUUID());
  const uploadInFlightRef = useRef(false);

  // XHR (not fetch) so we get real upload progress events for the bar.
  const uploadFileWithProgress = (formData: FormData) =>
    new Promise<{ key: string; publicUrl: string; uploadId?: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      // Bounded wait: without this a stalled connection leaves the button on
      // "Uploading…" forever with no way for the user to know it died.
      xhr.timeout = 120000;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as { key: string; publicUrl: string; uploadId?: string });
          } catch {
            reject(new Error("The server returned an unreadable response. Please try again."));
          }
          return;
        }
        // 413 comes from the hosting platform's body limit, not from the
        // handler — its body is plain text, so parsing it would throw and the
        // user would only see a generic "Upload failed".
        if (xhr.status === 413) {
          reject(new Error(`That file is too large to upload. Maximum size is ${MAX_FILE_SIZE_MB}MB.`));
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(data.error || "Failed to upload file"));
        } catch {
          reject(new Error(`Upload failed (server said ${xhr.status}). Please try again.`));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
      xhr.ontimeout = () => reject(new Error("The upload timed out. Please try again on a stronger connection."));
      xhr.send(formData);
    });

  const doUpload = async () => {
    if (!file) return;
    // Re-entry guard: the duplicate-warning modal's "Upload anyway" used to
    // fire this twice (click handler + implicit form submit) — and a rapid
    // double-click here can still race React's disabled state.
    if (uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
    setIsUploading(true);
    setShowDuplicateWarning(false);
    setUploadProgress(0);

    // Ask for OS notification permission inside this tap (iOS requires a
    // user gesture; desktop shows the browser prompt). Denied/unsupported is
    // fine — notify() falls back to the in-page toast.
    void requestNotificationPermission();

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("uploadId", uploadIdRef.current);

      const { key, publicUrl } = await uploadFileWithProgress(formData);
      setUploadProgress(100);

      const result = await uploadResource({
        title,
        description,
        type,
        subject,
        professor: professor.trim() || undefined,
        department: department.trim() || undefined,
        file_url: publicUrl,
        file_key: key,
        file_type: file.type,
        file_size: file.size,
        uploadId: uploadIdRef.current,
      });

      // Native OS notification when permitted (survives leaving the tab —
      // important for big files on slow networks); branded toast otherwise.
      void notify(
        "success",
        result?.alreadyExisted ? "Upload already saved" : "Resource published",
        result?.alreadyExisted ? `“${title}” was already saved — no duplicate created.` : `“${title}” is now live for other students.`,
      );
      router.push("/browse");
      router.refresh();
    } catch (error) {
      void notify("error", "Upload failed", getErrorMessage(error, "Failed to upload resource"));
      setIsUploading(false);
    } finally {
      uploadInFlightRef.current = false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }

    if (!subject || !type) {
      toast.error("Please select a subject and resource type");
      return;
    }

    // Check size here too, not only in the dropzone: a file picked before its
    // limit changed (or restored from a saved form) still reaches this path.
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`That file is over ${MAX_FILE_SIZE_MB}MB — please upload a smaller file.`);
      return;
    }

    // Check for duplicates before uploading — same title only counts when
    // the department matches too (a different department = a new resource).
    if (title.trim().length >= 3 && subject.trim().length >= 2) {
      const found = await checkDuplicateResources(title.trim(), subject.trim(), department.trim() || undefined);
      if (found.length > 0) {
        setDuplicates(found);
        setShowDuplicateWarning(true);
        return;
      }
    }

    await doUpload();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      <div>
        <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Title <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Midterm Past Paper 2023"
          required
          className="w-full h-14 px-4 rounded-xl border-2 border-ink bg-surface text-base font-medium text-foreground shadow-hard-sm focus:outline-none focus:shadow-hard transition-all placeholder:text-foreground/60"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Briefly describe what this resource contains..."
          className="flex min-h-[120px] w-full rounded-xl border-2 border-ink bg-surface px-4 py-3 text-base font-medium shadow-hard-sm placeholder:text-foreground/60 focus:outline-none focus:shadow-hard transition-all"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Department</label>
        <input
          type="text"
          list="department-list"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="Select or type a department..."
          className="flex h-14 w-full rounded-xl border-2 border-ink bg-surface px-4 py-2 text-base font-medium shadow-hard-sm focus:outline-none focus:shadow-hard transition-all placeholder:text-foreground/60"
        />
        <datalist id="department-list">
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <p className="mt-1.5 text-xs font-medium text-foreground/60">Optional — helps categorize your resource</p>
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Resource Type <span className="text-red-500">*</span></label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
            className="flex h-14 w-full rounded-xl border-2 border-ink bg-surface px-4 py-2 text-base font-medium shadow-hard-sm focus:outline-none focus:shadow-hard transition-all appearance-none"
          >
            <option value="" disabled>Select a type...</option>
            {RESOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Subject <span className="text-red-500">*</span></label>
          <input
            type="text"
            list="subject-list"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Select or type a subject..."
            required
            className="flex h-14 w-full rounded-xl border-2 border-ink bg-surface px-4 py-2 text-base font-medium shadow-hard-sm focus:outline-none focus:shadow-hard transition-all placeholder:text-foreground/60"
          />
          <datalist id="subject-list">
            {SUBJECTS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <p className="mt-1.5 text-xs font-medium text-foreground/60">Pick from the list or type your own subject</p>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Professor Name</label>
        <input
          type="text"
          value={professor}
          onChange={(e) => setProfessor(e.target.value)}
          placeholder="e.g., Dr. Ahmed Khan"
          className="w-full h-14 px-4 rounded-xl border-2 border-ink bg-surface text-base font-medium text-foreground shadow-hard-sm focus:outline-none focus:shadow-hard transition-all placeholder:text-foreground/60"
        />
        <p className="mt-1.5 text-xs font-medium text-foreground/60">Optional — helps other students find the right materials</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">File <span className="text-red-500">*</span></label>

        {!file ? (
          <div
            {...getRootProps()}
            className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-[1rem] border-2 border-dashed border-ink px-6 py-12 transition-all ${
              isDragActive ? "bg-accent scale-[1.02]" : "bg-surface-muted hover:bg-surface-muted"
            }`}
          >
            <input {...getInputProps()} />
            <div className="w-16 h-16 rounded-full border-2 border-ink bg-surface flex items-center justify-center mb-6">
              <Upload className="h-8 w-8 text-foreground" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">
                Click to upload or drag and drop
              </p>
              <p className="mt-2 text-sm font-medium text-foreground/60 tracking-wider">PDF, JPG, PNG, DOCX (up to {MAX_FILE_SIZE_MB}MB)
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between rounded-[1rem] border-2 border-ink bg-surface p-4 shadow-hard-sm">
            <div className="flex items-center gap-4 overflow-hidden">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[0.5rem] bg-accent border-2 border-ink text-foreground">
                <File size={24} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-foreground">{file.name}</p>
                <p className="text-sm font-medium text-foreground/60 tracking-wider">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="ml-4 flex-shrink-0 rounded-full border-2 border-ink p-2 bg-surface hover:bg-red-500 hover:text-background transition-colors"
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      <div className="pt-8">
        <button
          type="submit"
          className="w-full text-lg h-16 rounded-full border-2 border-ink bg-ink on-ink font-bold tracking-wider hover:-translate-y-1 hover:bg-ink hover:shadow-hard-accent transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          disabled={isUploading || !file}
        >
          {isUploading ? (uploadProgress < 100 ? `Uploading ${uploadProgress}%` : "Saving resource...") : "Publish Resource"}
        </button>

        {isUploading && (
          <div className="mt-4">
            <div className="h-2.5 w-full rounded-full border border-line bg-surface-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs font-bold tracking-wider text-foreground/60 text-center">
              {uploadProgress < 100 ? `Uploading your file… ${uploadProgress}%` : "Finishing up…"}
            </p>
          </div>
        )}
      </div>

      {/* Duplicate Warning Modal */}
      {showDuplicateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="bg-surface rounded-[2rem] border-2 border-ink shadow-hard-lg max-w-lg w-full p-8 space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Similar resource found</h3>
                <p className="text-sm text-foreground/60 font-medium mt-1">
                  We found {duplicates.length} similar resource{duplicates.length > 1 ? 's' : ''} already on the platform. Please check if your resource is a duplicate before uploading.
                </p>
              </div>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {duplicates.map((dup) => (
                <Link
                  key={dup.id}
                  href={`/resource/${dup.id}`}
                  target="_blank"
                  className="flex items-start gap-3 p-4 rounded-xl border-2 border-line bg-surface-muted hover:bg-surface-muted transition-colors group"
                >
                  <LinkIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-foreground/60 group-hover:text-accent" />
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate">{dup.title}</p>
                    <p className="text-xs font-medium text-foreground/60 mt-0.5">
                      {dup.subject}{dup.department ? ` · ${dup.department}` : ""} · Uploaded by {dup.uploader?.name || 'Anonymous'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateWarning(false);
                  setDuplicates([]);
                }}
                className="flex-1 h-12 rounded-full border-2 border-ink bg-surface text-foreground font-bold text-sm tracking-wider hover:bg-surface-muted transition-colors"
              >
                Go back & edit
              </button>
              <button
                type="button"
                onClick={doUpload}
                disabled={isUploading}
                className="flex-1 h-12 rounded-full border-2 border-ink bg-ink on-ink font-bold text-sm tracking-wider hover:-translate-y-0.5 hover:shadow-hard-accent-sm transition-all disabled:opacity-50"
              >
                {isUploading ? "Uploading..." : "Upload anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
