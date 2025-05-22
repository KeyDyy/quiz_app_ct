import { createClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "./runtime-config";

// Użyj runtime config zamiast bezpośredniego dostępu do process.env
const config = getRuntimeConfig();
const supabaseUrl = config.supabaseUrl;
const supabaseKey = config.supabaseAnonKey;

// Dodaj debugging w development
if (process.env.NODE_ENV === 'development' || process.env.DEBUG_ENV === 'true') {
    console.log('Supabase Config Debug:', {
        url: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'MISSING',
        key: supabaseKey ? `${supabaseKey.substring(0, 10)}...` : 'MISSING',
        tenantId: config.tenantId,
        nodeEnv: process.env.NODE_ENV,
        isServer: typeof window === "undefined"
    });
}

if (!supabaseUrl || !supabaseKey) {
    const errorMsg = `Supabase credentials are not set. Missing: ${!supabaseUrl ? 'URL' : ''} ${!supabaseKey ? 'KEY' : ''}. Tenant: ${config.tenantId || 'unknown'}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Export również funkcji do testowania konfiguracji
export const getSupabaseConfig = () => ({
    url: supabaseUrl,
    hasKey: !!supabaseKey,
    tenantId: config.tenantId
});