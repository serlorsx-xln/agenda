"use client";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-h2 font-bold">Something went wrong</h1>
      <p className="max-w-md text-small text-muted-foreground">
        {error.message || "Unexpected error"}
      </p>
      <button
        type="button"
        className="rounded-md border border-border px-4 py-2 text-small"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
