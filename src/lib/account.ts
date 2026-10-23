export const ACCOUNT_EMAIL_DOMAIN = "vote.local";

/**
 * 清洗输入的账号：去掉所有空白（含全角空格、零宽字符），
 * 并把中文输入法下误打的全角字母/数字/符号（如 ＠ ＿）转为半角。
 */
export function normalizeAccount(raw: string): string {
  return raw
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s\u3000\u200B-\u200D\uFEFF]/g, "");
}

/** 账号可以是邮箱（超级用户）或用户名（管理员 / 评委） */
export function accountToEmail(account: string): string {
  const value = normalizeAccount(account);
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
