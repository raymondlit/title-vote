ALTER TABLE public.ballots REPLICA IDENTITY FULL;
ALTER TABLE public.ballot_items REPLICA IDENTITY FULL;
ALTER TABLE public.offline_group_results REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ballots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ballot_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.offline_group_results;