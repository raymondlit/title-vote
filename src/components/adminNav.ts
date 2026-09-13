import type { NavItem } from "@/components/Shell";

export const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "概览" },
  { to: "/admin/branding", label: "界面配置", permission: "branding" },
  { to: "/admin/judges", label: "评委管理", permission: "judges" },
  { to: "/admin/groups", label: "类别与分组", permission: "groups_rules" },
  { to: "/admin/candidates", label: "评审对象", permission: "candidates" },
  { to: "/admin/rules", label: "投票规则", permission: "groups_rules" },
  { to: "/admin/sessions", label: "投票场次", permission: "groups_rules" },
  { to: "/admin/results", label: "投票结果", permission: "results" },
];
