import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { categoriesQueryOptions, groupsQueryOptions, METADATA_CACHE } from "./metadata";

describe("static metadata caching", () => {
  it("stays fresh for exactly five minutes, then allows SWR refresh", async () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      const load = vi.fn(async () => [{ id: "category", name: "教授" }]);
      const options = { ...METADATA_CACHE, queryKey: ["review_categories", "school"], queryFn: load };
      await client.fetchQuery(options);
      vi.advanceTimersByTime(299_999);
      await client.fetchQuery(options);
      expect(load).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      await client.fetchQuery(options);
      expect(load).toHaveBeenCalledTimes(2);
      client.clear();
    } finally { vi.useRealTimers(); }
  });
  it("invalidating categories immediately refreshes changed data", async () => {
    const client = new QueryClient();
    const load = vi.fn().mockResolvedValueOnce([{ name: "教授" }]).mockResolvedValueOnce([{ name: "副教授" }]);
    const options = { ...METADATA_CACHE, queryKey: ["review_categories", "school"], queryFn: load };
    await client.fetchQuery(options);
    await client.invalidateQueries({ queryKey: ["review_categories"] });
    expect(await client.fetchQuery(options)).toEqual([{ name: "副教授" }]);
    expect(load).toHaveBeenCalledTimes(2);
    client.clear();
  });
  it("keeps schools in separate category and group caches", () => {
    expect(categoriesQueryOptions("a").queryKey).toEqual(["review_categories", "a"]);
    expect(categoriesQueryOptions("b").queryKey).toEqual(["review_categories", "b"]);
    expect(groupsQueryOptions("a").queryKey).toEqual(["subject_groups", "a"]);
    expect(groupsQueryOptions("b").queryKey).toEqual(["subject_groups", "b"]);
  });
});