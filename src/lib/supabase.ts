import { createClient } from "@supabase/supabase-js";

let supabaseUrl: string;
let supabaseKey: string;

if (typeof window !== "undefined") {
    // In the browser, read from globalThis or window
    supabaseUrl = (window as any).NEXT_PUBLIC_SUPABASE_URL;
    supabaseKey = (window as any).NEXT_PUBLIC_SUPABASE_ANON_KEY;
} else {
    // On the server, read from process.env (if available)
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
}

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase credentials are not set. Please provide them at runtime.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
