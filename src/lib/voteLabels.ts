export type VoteLabels = {
  recommend: string;
  not_recommend: string;
  abstain: string;
};

export const DEFAULT_VOTE_LABELS: VoteLabels = {
  recommend: "推荐",
  not_recommend: "不推荐",
  abstain: "弃权",
};

type SchoolLike = {
  vote_label_recommend?: string | null;
  vote_label_not_recommend?: string | null;
} | null | undefined;

/** 读取学校自定义的投票选项名称，未配置时回落到默认值。 */
export function voteLabels(school: SchoolLike): VoteLabels {
  return {
    recommend: school?.vote_label_recommend?.trim() || DEFAULT_VOTE_LABELS.recommend,
    not_recommend:
      school?.vote_label_not_recommend?.trim() || DEFAULT_VOTE_LABELS.not_recommend,
    abstain: DEFAULT_VOTE_LABELS.abstain,
  };
}
