/** 投票场次归档 / 删除的业务规则（前端与服务端共用） */

export type ArchivableSession = {
  status: string;
  archived_at?: string | null;
};

export function isArchived(s: ArchivableSession) {
  return !!s.archived_at;
}

/** 进行中的场次不能归档，须先结束投票 */
export function canArchive(s: ArchivableSession) {
  return !isArchived(s) && s.status !== "open";
}

/** 进行中的场次不能删除，须先结束投票 */
export function canDelete(s: ArchivableSession) {
  return s.status !== "open";
}

export function splitByArchive<T extends ArchivableSession>(list: T[]) {
  const active: T[] = [];
  const archived: T[] = [];
  for (const s of list) (isArchived(s) ? archived : active).push(s);
  return { active, archived };
}
