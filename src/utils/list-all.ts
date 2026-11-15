import { z } from "zod";
import type { NetworkClient } from "../client.js";

const PAGE_LIMIT = 200;
const MAX_PAGES = 50;

/** Every item of a paged Integration API list, read page by page. */
export async function listAll<T extends z.ZodType>(client: NetworkClient, path: string, item: T): Promise<z.infer<T>[]> {
  const page = z.object({ data: z.array(item), totalCount: z.number().optional() }).loose();
  const items: z.infer<T>[] = [];
  for (let pages = 0; pages < MAX_PAGES; pages++) {
    const { data, totalCount } = page.parse(await client.get(`${path}?offset=${items.length}&limit=${PAGE_LIMIT}`));
    items.push(...data);
    // Without a totalCount, only an empty page shows the list has ended: a
    // controller may cap pages below PAGE_LIMIT, so a short page proves nothing.
    if (data.length === 0 || (totalCount !== undefined && items.length >= totalCount)) return items;
  }
  // A list that does not end cannot be checked, which must not pass.
  throw new Error(`the list did not end after ${MAX_PAGES} pages`);
}
