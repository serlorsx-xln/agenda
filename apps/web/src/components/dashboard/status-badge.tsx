import { Badge, type BadgeProps } from "@/components/ui/badge";

const CONNECTION_VARIANT: Record<string, BadgeProps["variant"]> = {
  connected: "success",
  connecting: "warning",
  disconnected: "muted",
  error: "destructive",
};

const RUN_VARIANT: Record<string, BadgeProps["variant"]> = {
  queued: "muted",
  running: "warning",
  success: "success",
  partial: "warning",
  failed: "destructive",
  cancelled: "muted",
};

const EVENT_VARIANT: Record<string, BadgeProps["variant"]> = {
  success: "success",
  failed: "destructive",
  skipped: "muted",
  info: "secondary",
};

const PAYMENT_VARIANT: Record<string, BadgeProps["variant"]> = {
  paid: "success",
  pending: "warning",
  failed: "destructive",
  expired: "muted",
};

export function ConnectionBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return <Badge variant={CONNECTION_VARIANT[status] ?? "muted"}>{label}</Badge>;
}

export function RunStatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return <Badge variant={RUN_VARIANT[status] ?? "muted"}>{label}</Badge>;
}

export function EventStatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return <Badge variant={EVENT_VARIANT[status] ?? "secondary"}>{label}</Badge>;
}

export function PaymentStatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return <Badge variant={PAYMENT_VARIANT[status] ?? "muted"}>{label}</Badge>;
}
