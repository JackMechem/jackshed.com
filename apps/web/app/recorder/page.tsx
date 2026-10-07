import Recorder from "@/components/Recorder";

export default function RecorderPage() {
  return (
    <>
      {/* The recorder needs a desktop-sized screen. */}
      <div className="hidden min-h-full flex-1 flex-col lg:flex">
        <Recorder />
      </div>
      <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 px-8 text-center lg:hidden">
        <h1 className="text-xl font-semibold text-accent">Recorder</h1>
        <p className="max-w-xs text-sm text-muted">
          The Recorder needs a larger screen and a desktop browser, so it isn&apos;t available on
          phones or small tablets. Open sheddex on a computer to use it.
        </p>
      </div>
    </>
  );
}
