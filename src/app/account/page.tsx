"use client";
import { useUserAuth } from "@/lib/userAuth";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useUser } from "../../../hooks/useUser";
import FriendList from "@/components/FriendList";
import FriendInvite from "@/components/FriendSearch";
import Button from "@/components/Button";

function UsernameCheck() {
  const [username, setUsername] = useState("");
  const [isUsernameMissing, setIsUsernameMissing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const { user } = useUser();

  useEffect(() => {
    checkUsername();
  }, [user]);

  async function checkUsername() {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("username")
        .eq("id", user?.id);

      if (error) {
        throw error;
      }

      if (!data || !data.length || !data[0].username) {
        setIsUsernameMissing(true);
        setShowModal(true);
      } else {
        setUsername(data[0].username);
      }
    } catch (error) {
      console.error("Error checking username:", error);
    }
  }

  const handleAddUsername = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .update({ username })
        .eq("id", user?.id);

      setIsUsernameMissing(false);
      setShowModal(false);
      checkUsername();
      if (error) {
        throw error;
      }

      if (data) {
        // setIsUsernameMissing(false);
        // setShowModal(false);
        // checkUsername();
      }
    } catch (error) {
      console.error("Error adding username:", error);
    }
  };

  return (
    <div className="max-w-md mx-auto p-8">
      {showModal && (
        <div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-gray-100 p-12 rounded-2xl">
            <p className="font-bold text-xl">Proszę dodaj swój nick:</p>
            <input
              type="text"
              placeholder="Wpisz tutaj"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-4 mb-1 p-2 border rounded flex border-gray-400 focus:border-black"
              style={{
                outline: "none",
                boxShadow: "0 0 3px rgba(0, 0, 0, 0.5)",
              }}
            />
            <Button
              onClick={handleAddUsername}
              className="mt-4 bg-black text-white p-2 rounded"
            >
              Dodaj nick
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  useUserAuth();
  const [userStats, setUserStats] = useState({
    totalWins: 0,
  });
  const { user } = useUser();

  useEffect(() => {
    checkUserStats();
  }, [user]);

  async function checkUserStats() {
    try {
      const { data: statsData, error: statsError } = await supabase
        .from("MultiplayerGame")
        .select("winner_user_id");

      if (statsError) {
        throw statsError;
      }

      const winsCount: Record<string, number> = statsData.reduce((acc, stat) => {
        const winnerUserId = stat?.winner_user_id as string;

        if (winnerUserId !== undefined) {
          acc = acc || {};
          acc[winnerUserId] = (acc[winnerUserId] || 0) + 1;
        }

        return acc;
      }, {} as Record<string, number>);

      const userId = user?.id;
      const userWins = userId !== undefined ? winsCount[userId] || 0 : 0;

      setUserStats({
        totalWins: userWins,
      });
    } catch (error) {
      console.error("Error checking username and stats:", error);
    }
  }
  return (
    <div className="flex bg-gray-100 dark:bg-gray-900 lg:p-24 md:p-12 p-8 grid lg:grid-cols-2 grid-cols-1 lg:divide-x">
      <div className="flex-1 m-4">
        <FriendInvite />
        <FriendList />
        <div className="p-8 ">
          <UsernameCheck />
        </div>
      </div>
      <div className="flex-1 m-4 px-auto">
        <div className="flex justify-between font-bold">
          <div className="m-auto text-center">
            <p className="font-bold lg:text-2xl text-xl pb-4">
              Twoje statystyki gier Multiplayer
            </p>
            <p>Wygrane gry {userStats.totalWins}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
