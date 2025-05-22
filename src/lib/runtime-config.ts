// lib/runtime-config.ts
interface RuntimeConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
    tenantId: string;
}

let cachedConfig: RuntimeConfig | null = null;

export function getRuntimeConfig(): RuntimeConfig {
    // Cache config dla performance
    if (cachedConfig) {
        return cachedConfig;
    }

    let supabaseUrl: string;
    let supabaseAnonKey: string;
    let tenantId: string;

    if (typeof window !== 'undefined') {
        // W przeglądarce - próbuj pobrać z API
        // Fallback do process.env jeśli jest dostępne
        supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        tenantId = process.env.TENANT_ID || '';
    } else {
        // Na serwerze - zawsze używaj process.env
        supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        tenantId = process.env.TENANT_ID || '';
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(`Missing runtime configuration. URL: ${!!supabaseUrl}, Key: ${!!supabaseAnonKey}, Tenant: ${tenantId}`);
    }

    cachedConfig = {
        supabaseUrl,
        supabaseAnonKey,
        tenantId,
    };

    return cachedConfig;
}

// Funkcja do resetowania cache (przydatne w testach)
export function resetConfigCache() {
    cachedConfig = null;
}

// Hook do użycia w React komponentach
export function useRuntimeConfig() {
    if (typeof window !== 'undefined') {
        // W przeglądarce, możesz użyć state do odświeżania
        return getRuntimeConfig();
    }
    return getRuntimeConfig();
}