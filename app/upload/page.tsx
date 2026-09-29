import UploadForm from "./UploadForm";

export default function UploadPage() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 sm:py-12 lg:px-8 max-w-[1400px]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-foreground">Upload a Resource</h1>
          <p className="mt-3 sm:mt-4 text-base sm:text-lg text-foreground/60 font-medium tracking-wider">Share your study materials with the community.</p>
        </div>

        {/* Mobile: tighter card padding (p-5) keeps form fields from feeling
            lost inside a 2rem frame on a 360px screen; the brutalist frame
            itself is unchanged. */}
        <div className="rounded-[1.5rem] border-2 border-ink bg-surface p-4 shadow-hard sm:rounded-[2rem] sm:p-8 lg:p-12">
          <UploadForm />
        </div>
      </div>
    </div>
  );
}