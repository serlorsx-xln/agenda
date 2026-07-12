/**
 * Semantic icon exports — use these instead of importing lucide icons ad hoc.
 *
 * Rules:
 * - Send actions: IconSend (never Play)
 * - Edit / delete: IconEdit, IconDelete
 * - Help tooltips on form labels only: IconHelp
 * - Internal links: no icon (never ExternalLink on in-app links)
 */
export {
  CircleHelp as IconHelp,
  FileText as IconTemplate,
  History as IconRuns,
  Link2 as IconConnect,
  Loader2 as IconLoader,
  MessagesSquare as IconChats,
  MessageSquareReply as IconAutoReply,
  Pencil as IconEdit,
  Plus as IconPlus,
  Send as IconSend,
  Trash2 as IconDelete,
} from "lucide-react";

export type { LucideIcon } from "lucide-react";
