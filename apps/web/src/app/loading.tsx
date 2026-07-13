import { IconLoader } from "@/lib/icons";

export default function RootLoading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <IconLoader className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
