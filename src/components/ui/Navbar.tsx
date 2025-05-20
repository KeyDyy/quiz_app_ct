"use client";
import Link from "next/link";
import React, { useState } from "react";
import useAuthModal from "../../../hooks/useAuthModal";
import Button from "../Button";
import { useRouter } from "next/navigation";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { useUser } from "../../../hooks/useUser";
import { toast } from "react-hot-toast";
import { FaUserAlt } from "react-icons/fa";
import { useSidebar } from "../../../providers/SidebarContext";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";

function isScreenSizeGreaterThan1000() {
  return window.innerWidth > 1000;
}

const Navbar = () => {
  const { user } = useUser();
  const { toggleSidebar } = useSidebar();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const authModal = useAuthModal();
  const supabaseClient = useSupabaseClient();


  const findUser = async () => {
    try {
      setLoading(true);

      if (user) {
        const { data, error } = await supabase
          .from("users")
          .select("id, username")
          .eq("id", user.id)
          .single();

        if (error) {
          throw error;
        }

        if (data) {
          setUsername(data.username || null);
        }
      } else {
        // Throw an error if the user object is not available.
        throw new Error("User information is not available.");
      }
    } catch (error) {
      console.error("Error finding user:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    findUser();
  }, [user]);

  const handleLogout = async () => {
    const { error } = await supabaseClient.auth.signOut();
    //player.reset();
    router.refresh();
    router.push("/");
    if (error) {
      toast.error(error.message);
    }
  };

  const handleToggleSidebar = () => {
    toggleSidebar();
  };

  return (
    <div className="sticky inset-x-0 top-0 bg-white dark:bg-gray-950 z-[20] h-fit border-b border-zinc-300">
      <div className="flex items-center justify-between py-2 px-8 mx-auto max-w-7xl">
        <button
          onClick={() => router.push("/")}
          className="rounded-lg border-2 border-b-4 border-r-4 border-black px-2 py-1 text-xl font-bold transition-all hover:-translate-y-[2px] md:block dark:border-white"
        >
          Quiz_app
        </button>

        {user ? (
          <div className="flex gap-x-4 items-center">
            {isScreenSizeGreaterThan1000() && (
              <div className="email">
              {loading ? "Loading..." : username || user.email}
            </div>
            )}
            <Button
              onClick={() => router.push("/account")}
              className="bg-white"
            >
              <FaUserAlt />
            </Button>
            <Button
              onClick={handleLogout}
              className="bg-white rounded-lg border-2 border-b-4 border-r-4 border-black px-2 py-1 text-xl font-bold transition-all hover:-translate-y-[2px] md:block dark:border-white"
            >
              Wyloguj
            </Button>

            <button
              onClick={handleToggleSidebar}
              className="inline-block relative"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-gray-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <span className="animate-ping absolute top-1 right-0.5 block h-1 w-1 rounded-full ring-2 ring-green-400 bg-green-600"></span>
            </button>
          </div>
        ) : (
          <button
            onClick={authModal.onOpen}
            className="rounded-lg border-2 border-b-4 border-r-4 border-black px-2 py-1 text-xl font-bold transition-all hover:-translate-y-[2px] md:block dark:border-white ml-4"
          >
            Zaloguj
          </button>
        )}
      </div>
    </div>
  );
};

export default Navbar;
