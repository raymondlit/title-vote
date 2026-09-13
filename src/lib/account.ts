export const ACCOUNT_EMAIL_DOMAIN = "vote.local";

/** 账号可以是邮箱（超级用户）或用户名（管理员 / 评委） */
export function accountToEmail(account: string): string {
  const value = account.trim();
  if (value.includes("@")) return value.toLowerCase();
  return `${value.toLowerCase()}@${ACCOUNT_EMAIL_DOMAIN}`;
}

export const PERMISSION_LABELS: Record<string, string> = {
  branding: "界面配置",
  judges: "评委管理",
  candidates: "评审对象管理",
  groups_rules: "分组与规则",
  results: "结果查看",
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS);

export const COMMITTEE_ROLE_LABELS: Record<string, string> = {
  chair: "主任委员",
  vice_chair: "副主任委员",
  member: "委员",
};
