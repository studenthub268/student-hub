import UploadForm from "./UploadForm";

export default function UploadPage() {
  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-[1400px]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-black">Upload a Resource</h1>
          <p className="mt-4 text-lg text-black/60 font-medium tracking-wider">Share your study materials with the community.</p>
        </div>

        <div className="rounded-[2rem] border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_#111] sm:p-12">
          <UploadForm />
        </div>
      </div>
    </div>
  );
}