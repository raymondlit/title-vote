-- 评委提交选票：全部校验与写入在一个数据库事务内完成（一次往返，失败整体回滚）。
-- SECURITY INVOKER：以评委自己的身份运行，行级权限照常生效。
-- 规则须与 src/lib/rounds.ts（effectiveRoundRule/hasFixedPool）、src/lib/voteRules.ts（pickVotingRule）、
-- src/lib/committee.ts（fetchRecommendedCandidateIds）保持一致。
CREATE OR REPLACE FUNCTION public.submit_ballot(_session_id uuid, _choices jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_judge record;
  v_session record;
  v_label text;
  v_valid uuid[];
  v_pool_size int;
  v_total int;
  v_distinct int;
  v_invalid int;
  v_recommends int;
  v_abstains int;
  v_rule record;
  v_has_rule boolean := false;
  v_max int;
  v_allow_abstain boolean;
  v_require_all boolean;
  v_ballot_id uuid;
  v_submitted_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;
  IF _choices IS NULL OR jsonb_typeof(_choices) <> 'array' THEN
    RAISE EXCEPTION '提交内容格式有误';
  END IF;
  IF jsonb_array_length(_choices) > 500 THEN
    RAISE EXCEPTION '提交的评审对象过多';
  END IF;

  SELECT j.id, j.school_id, j.group_id, j.is_committee_member
    INTO v_judge
    FROM judges j WHERE j.profile_id = auth.uid()
    ORDER BY j.created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION '当前账号不是评委';
  END IF;

  SELECT s.id, s.school_id, s.category_id, s.group_id, s.status, s.voter_scope,
         s.candidate_ids, s.max_recommend, s.archived_at
    INTO v_session
    FROM vote_sessions s WHERE s.id = _session_id;
  IF NOT FOUND OR v_session.school_id IS DISTINCT FROM v_judge.school_id OR v_session.archived_at IS NOT NULL THEN
    RAISE EXCEPTION '投票不存在';
  END IF;

  SELECT COALESCE(NULLIF(btrim(sc.vote_label_recommend), ''), '推荐')
    INTO v_label FROM schools sc WHERE sc.id = v_session.school_id;
  v_label := COALESCE(v_label, '推荐');

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION '该场投票尚未开始或已结束';
  END IF;

  IF v_session.voter_scope = 'committee' THEN
    IF NOT COALESCE(v_judge.is_committee_member, false) THEN
      RAISE EXCEPTION '您不是大评审委员会成员，无法参加本场投票';
    END IF;
  ELSIF v_session.group_id IS NOT NULL
        AND v_session.voter_scope <> 'all'
        AND v_session.group_id IS DISTINCT FROM v_judge.group_id THEN
    RAISE EXCEPTION '您不在本场投票的评委范围内';
  END IF;

  IF EXISTS (SELECT 1 FROM ballots b WHERE b.session_id = v_session.id AND b.judge_id = v_judge.id) THEN
    RAISE EXCEPTION '您已提交过本场投票，不能重复提交';
  END IF;

  -- 本场参评范围
  IF v_session.candidate_ids IS NOT NULL THEN
    -- 多轮遴选：本轮参评名单固定
    SELECT COALESCE(array_agg(c.id), '{}') INTO v_valid
      FROM candidates c
     WHERE c.school_id = v_session.school_id AND c.id = ANY (v_session.candidate_ids);
  ELSE
    SELECT COALESCE(array_agg(c.id), '{}') INTO v_valid
      FROM candidates c
     WHERE c.school_id = v_session.school_id
       AND (v_session.category_id IS NULL OR c.category_id = v_session.category_id)
       AND (v_session.group_id IS NULL OR c.group_id = v_session.group_id)
       AND (
         v_session.voter_scope IS DISTINCT FROM 'committee'
         OR EXISTS (
           SELECT 1 FROM offline_group_results o
            WHERE o.school_id = v_session.school_id
              AND o.is_recommended
              AND o.candidate_id = c.id
              AND (v_session.category_id IS NULL OR o.category_id = v_session.category_id)
         )
       );
  END IF;
  v_pool_size := COALESCE(array_length(v_valid, 1), 0);

  -- 解析与校验选择项
  SELECT count(*),
         count(DISTINCT (e->>'candidateId')),
         count(*) FILTER (
           WHERE (e->>'candidateId') IS NULL
              OR (e->>'candidateId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              OR NOT ((e->>'candidateId')::uuid = ANY (v_valid))
         ),
         count(*) FILTER (WHERE e->>'choice' = 'recommend'),
         count(*) FILTER (WHERE e->>'choice' = 'abstain')
    INTO v_total, v_distinct, v_invalid, v_recommends, v_abstains
    FROM jsonb_array_elements(_choices) e;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_choices) e
     WHERE COALESCE(e->>'choice', '') NOT IN ('recommend', 'not_recommend', 'abstain')
  ) THEN
    RAISE EXCEPTION '表决选项无效';
  END IF;
  IF v_invalid > 0 THEN
    RAISE EXCEPTION '提交的评审对象不在本场投票范围内';
  END IF;
  IF v_distinct <> v_total THEN
    RAISE EXCEPTION '同一评审对象重复提交';
  END IF;

  -- 规则匹配优先级：类别+小组 > 类别 > 小组 > 全校默认
  SELECT r.max_recommend, r.allow_abstain, r.require_all
    INTO v_rule
    FROM voting_rules r
   WHERE r.school_id = v_session.school_id
     AND (
       (v_session.category_id IS NOT NULL AND v_session.group_id IS NOT NULL
         AND r.category_id = v_session.category_id AND r.group_id = v_session.group_id)
       OR (v_session.category_id IS NOT NULL AND r.category_id = v_session.category_id AND r.group_id IS NULL)
       OR (v_session.group_id IS NOT NULL AND r.category_id IS NULL AND r.group_id = v_session.group_id)
       OR (r.category_id IS NULL AND r.group_id IS NULL)
     )
   ORDER BY CASE
       WHEN r.category_id IS NOT NULL AND r.group_id IS NOT NULL THEN 1
       WHEN r.category_id IS NOT NULL THEN 2
       WHEN r.group_id IS NOT NULL THEN 3
       ELSE 4 END,
     r.created_at
   LIMIT 1;
  v_has_rule := FOUND;

  -- 本轮实际生效规则：场次设置的本轮名额覆盖规则名额
  IF v_session.max_recommend IS NOT NULL THEN
    v_max := v_session.max_recommend;
    v_allow_abstain := CASE WHEN v_has_rule THEN v_rule.allow_abstain ELSE false END;
    v_require_all := CASE WHEN v_has_rule THEN v_rule.require_all ELSE true END;
    v_has_rule := true;
  ELSIF v_has_rule THEN
    v_max := v_rule.max_recommend;
    v_allow_abstain := v_rule.allow_abstain;
    v_require_all := v_rule.require_all;
  END IF;

  IF v_has_rule THEN
    IF v_max > 0 AND v_recommends <> v_max THEN
      IF v_recommends > v_max THEN
        RAISE EXCEPTION '本轮%名额 % 人，已选 % 人，超出 % 人，无法提交，请调整后再试',
          v_label, v_max, v_recommends, v_recommends - v_max;
      ELSE
        RAISE EXCEPTION '本轮须%  % 人，当前仅 % 人，还差 % 人，无法提交',
          v_label, v_max, v_recommends, v_max - v_recommends;
      END IF;
    END IF;
    IF NOT v_allow_abstain AND v_abstains > 0 THEN
      RAISE EXCEPTION '本场投票不允许弃权';
    END IF;
    IF v_require_all AND v_distinct <> v_pool_size THEN
      RAISE EXCEPTION '本场投票要求对每位评审对象表态';
    END IF;
  END IF;

  -- 写入：唯一约束兜底并发重复提交，任一步失败整张票回滚
  BEGIN
    INSERT INTO ballots (session_id, judge_id)
    VALUES (v_session.id, v_judge.id)
    RETURNING id, submitted_at INTO v_ballot_id, v_submitted_at;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION '您已提交过本场投票，不能重复提交';
  END;

  IF v_total > 0 THEN
    INSERT INTO ballot_items (ballot_id, candidate_id, choice)
    SELECT v_ballot_id, (e->>'candidateId')::uuid, (e->>'choice')::vote_choice
      FROM jsonb_array_elements(_choices) e;
  END IF;

  RETURN jsonb_build_object('ballotId', v_ballot_id, 'submittedAt', v_submitted_at);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_ballot(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_ballot(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_ballot(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ballot(uuid, jsonb) TO service_role;