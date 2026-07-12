"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ padding: 32, fontFamily: "sans-serif", textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>{error.message || "Unexpected error"}</p>
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
