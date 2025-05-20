import { useEffect, useState, createContext, useContext } from 'react';
import {
    useUser as useSupaUser,
    useSessionContext,
    User
} from '@supabase/auth-helpers-react';

import { UserDetails } from '../types';

type UserContextType = {
    accessToken: string | null;
    user: User | null;
    userDetails: UserDetails | null;
    isLoading: boolean;
    // subscription: Subscription | null;
};

export const UserContext = createContext<UserContextType | undefined>(
    undefined
);

export interface Props {
    [propName: string]: any;
}

export const MyUserContextProvider = (props: Props) => {
    const {
        session,
        isLoading: isLoadingUser,
        supabaseClient: supabase
    } = useSessionContext();
    const user = useSupaUser();
    const accessToken = session?.access_token ?? null;
    const [isLoadingData, setIsloadingData] = useState(false);
    const [userDetails, setUserDetails] = useState<UserDetails | null>(null);

    const getUserDetails = async () => {
        if (!user?.id) return null;
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching user details:', error);
            return null;
        }
    };

    const createUserEntry = async () => {
        if (!user?.id || !user?.email) return;

        try {
            // First check if user exists
            const { data: existingUser, error: checkError } = await supabase
                .from('users')
                .select('id')
                .eq('id', user.id)
                .single();

            // If user doesn't exist, create new entry
            if (checkError?.code === 'PGRST116') {
                const { error: insertError } = await supabase
                    .from('users')
                    .insert([
                        {
                            id: user.id,
                            full_name: user.email,
                        }
                    ]);

                if (insertError) {
                    console.error('Error creating user entry:', insertError);
                    throw insertError;
                }
            }
        } catch (error) {
            console.error('Error in createUserEntry:', error);
        }
    };

    useEffect(() => {
        const initializeUser = async () => {
            if (user?.id && !isLoadingData && !userDetails) {
                setIsloadingData(true);
                try {
                    await createUserEntry();
                    const details = await getUserDetails();
                    if (details) {
                        setUserDetails(details as UserDetails);
                    }
                } catch (error) {
                    console.error('Error initializing user:', error);
                } finally {
                    setIsloadingData(false);
                }
            } else if (!user && !isLoadingUser && !isLoadingData) {
                setUserDetails(null);
            }
        };

        initializeUser();
    }, [user, isLoadingUser]);

    const value = {
        accessToken,
        user,
        userDetails,
        isLoading: isLoadingUser || isLoadingData,
    };

    return <UserContext.Provider value={value} {...props} />;
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error(`useUser must be used within a MyUserContextProvider.`);
    }
    return context;
};