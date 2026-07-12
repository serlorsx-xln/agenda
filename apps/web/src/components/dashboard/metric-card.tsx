import { type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-small text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <div className="mt-3 text-h1 font-bold leading-none">{value}</div>
        {hint && (
          <p className="mt-2 text-caption text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
