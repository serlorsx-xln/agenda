import {
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  Link2,
  Menu,
  MessagesSquare,
  MessageSquareReply,
  Send,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  { key: "overview", href: "/dashboard", icon: LayoutDashboard },
  { key: "connect", href: "/dashboard/connect", icon: Link2 },
  { key: "openchats", href: "/dashboard/openchats", icon: MessagesSquare },
  { key: "templates", href: "/dashboard/templates", icon: FileText },
  { key: "autoReply", href: "/dashboard/auto-reply", icon: MessageSquareReply },
  { key: "campaigns", href: "/dashboard/campaigns", icon: Send },
  { key: "runs", href: "/dashboard/runs", icon: History },
  { key: "billing", href: "/dashboard/billing", icon: CreditCard },
  { key: "settings", href: "/dashboard/settings", icon: Settings },
];

export const ADMIN_NAV: NavItem[] = [
  { key: "admin", href: "/dashboard/admin", icon: Shield, adminOnly: true },
];

/** Bottom bar: Home, Campaigns, Chats, More */
export const MOBILE_PRIMARY_NAV: NavItem[] = [
  { key: "overview", href: "/dashboard", icon: LayoutDashboard },
  { key: "campaigns", href: "/dashboard/campaigns", icon: Send },
  { key: "openchats", href: "/dashboard/openchats", icon: MessagesSquare },
];

export const MOBILE_MORE_NAV: NavItem[] = [
  { key: "connect", href: "/dashboard/connect", icon: Link2 },
  { key: "templates", href: "/dashboard/templates", icon: FileText },
  { key: "autoReply", href: "/dashboard/auto-reply", icon: MessageSquareReply },
  { key: "runs", href: "/dashboard/runs", icon: History },
  { key: "billing", href: "/dashboard/billing", icon: CreditCard },
  { key: "settings", href: "/dashboard/settings", icon: Settings },
  { key: "admin", href: "/dashboard/admin", icon: Shield, adminOnly: true },
];

export const MOBILE_MORE_ICON = Menu;

