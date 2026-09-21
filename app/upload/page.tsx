import UploadForm from "./UploadForm";

export default function UploadPage() {
  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-[1400px]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-foreground">Upload a Resource</h1>
          <p className="mt-4 text-lg text-foreground/60 font-medium tracking-wider">Share your study materials with the community.</p>
        </div>

        <div className="rounded-[2rem] border-2 border-ink bg-surface p-6 shadow-hard sm:p-12">
          <UploadForm />
        </div>
      </div>
    </div>
  );
}