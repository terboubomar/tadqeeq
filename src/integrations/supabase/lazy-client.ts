/**
 * The Supabase browser client, loaded on first use. Route guards (beforeLoad/loader) and global middleware end up
 * in the JavaScript every page loads, so they use this instead of importing the client directly; public pages
 * (homepage, guides, legal) then don't download Supabase until something needs it.
 */
export const loadSupabase = async () => (await import("./client")).supabase;
