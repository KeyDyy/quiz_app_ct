"use client";
import React, { useEffect, useState } from "react";
import { useUser } from "../../hooks/useUser";
import { supabase } from "../lib/supabase";
import "@/app/friends/index.css";
import { useSidebar } from "../../providers/SidebarContext";
import { useRouter } from "next/navigation";

interface GameInvitation {
  invitation_id: number;
  game_id: string;
  sender_user_id: string;
  receiver_user_id: string;
  status: "Pending" | "Accepted" | "Rejected";
}

const Notifications = () => {
  const { user } = useUser();
  const { toggleSidebar, showSidebar } = useSidebar();
  const router = useRouter();
  const [pendingInvitations, setPendingInvitations] = useState<
    GameInvitation[]
  >([]); // Zainicjowanie jako pusta tablica
  const [senderUser, setSenderUser] = useState<{
    [key: string]: { id: string; username: string };
  }>({});

  useEffect(() => {
    if (showSidebar && user && user.id) {
      // Refresh notifications when the sidebar is expanded
      checkGameInvitations(user.id);
    }
  }, [showSidebar, user]);

  const checkGameInvitations = async (userId: string) => {
    try {
      if (!userId) {
        console.error("User ID is not valid.");
        return;
      }

      const { data, error } = await supabase
        .from("GameInvitations") // Ustal typ danych
        .select()
        .eq("receiver_user_id", userId)
        .eq("status", "Pending");

      if (error) {
        console.error("Error checking game invitations:", error);
        return;
      }

      if (!data || data.length === 0) {
        console.log("Brak oczekujących zaproszeń do gry.");
        setPendingInvitations(data);
        return;
      }

      const senderUserIds = data.map((invitation) => invitation.sender_user_id);
      const { data: senderUsers, error: senderUserError } = await supabase
        .from("users")
        .select("id, username")
        .in("id", senderUserIds);

      if (senderUserError) {
        console.error("Error fetching sender user details:", senderUserError);
        return;
      }
      const senderUserMap: { [key: string]: { id: string; username: string } } =
        {};
      senderUsers.forEach((user) => {
        senderUserMap[user.id] = user;
      });

      setSenderUser(senderUserMap);
      setPendingInvitations(data);
    } catch (error) {
      console.error("Error checking game invitations:", error);
    }
  };

  const acceptGameInvitation = async (invitationId: number) => {
    try {
      // Fetch the game invitation details
      const { data: invitation, error: invitationError } = await supabase
        .from("GameInvitations")
        .select("*")
        .eq("invitation_id", invitationId)
        .single();

      if (invitationError) {
        console.error(
          "Error fetching game invitation details:",
          invitationError
        );
        return;
      }

      // Update the game invitation status to "Accepted"
      const { error: updateError } = await supabase
        .from("GameInvitations")
        .update({ status: "Accepted" })
        .eq("invitation_id", invitationId);

      if (updateError) {
        console.error("Error accepting game invitation:", updateError);
        return;
      }

      // Retrieve data from MultiplayerGame based on invitation_id
      const { data: multiplayerGameData, error: multiplayerGameError } =
        await supabase
          .from("MultiplayerGame")
          .select("*")
          .eq("invitation_id", invitationId)
          .single();

      if (multiplayerGameError) {
        console.error(
          "Error retrieving MultiplayerGame data:",
          multiplayerGameError
        );
        return;
      }

      if (multiplayerGameData) {
        // Update the start_time field in MultiplayerGame
        const { error: updateStartTimeError } = await supabase
          .from("MultiplayerGame")
          .update({
            start_time: new Date(),
          })
          .eq("invitation_id", invitationId);

        if (updateStartTimeError) {
          console.error(
            "Error updating start_time in MultiplayerGame:",
            updateStartTimeError
          );
          return;
        }

        // Redirect to the multiplayer game page with the obtained game_id
        router.push(`/quiz/multi/${multiplayerGameData.game_id}`);
        toggleSidebar();
      } else {
        console.error(
          "Error: MultiplayerGame data not found for invitation_id:",
          invitationId
        );
      }

      // Refresh the list of game invitations
      checkGameInvitations(user?.id || "");
    } catch (error) {
      console.error("Error accepting game invitation:", error);
    }
  };

  const rejectGameInvitation = async (invitationId: number) => {
    try {
      const { data, error } = await supabase
        .from("GameInvitations") // Ustal typ danych
        .delete()
        .eq("invitation_id", invitationId); // Użyj 'invitation_id' zamiast 'id'

      if (error) {
        console.error("Error rejecting game invitation:", error);
      } else {
        console.log("Zaproszenie do gry zostało odrzucone.");
        // Odśwież listę zaproszeń
        checkGameInvitations(user?.id || "");
      }
    } catch (error) {
      console.error("Error rejecting game invitation:", error);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        {user && (
          <div
            className={`right-sidebar ${
              showSidebar ? "show" : "hide"
            } sm:w-64 md:w-72 lg:w-96 xl:w-120 flex flex-col h-screen`}
          >
            <div className="flex-1 overflow-y-auto">
              <h2 className="mt-14 text-xl font-bold flex items-center justify-center">
                Powiadomienia
              </h2>
              <div className="mt-4">
                {pendingInvitations.map((invitation) => (
                  <div
                    key={invitation.invitation_id}
                    className="p-4 bg-gray-100 rounded border border-gray-200 mb-4"
                  >
                    <p className="font-bold">
                      {(senderUser as any)[invitation.sender_user_id]
                        ?.username || "Nieznany użytkownik"}{" "}
                      <span className="font-normal">zaprasza Cię do gry</span>
                    </p>

                    <div className="mt-4 flex items-center justify-center gap-4">
                      <button
                        onClick={() =>
                          acceptGameInvitation(invitation.invitation_id)
                        }
                        className="bg-green-500 text-gray-100 px-4 py-2 rounded mr-2 border-green-700 border font-bold"
                      >
                        Akceptuj
                      </button>
                      <button
                        onClick={() =>
                          rejectGameInvitation(invitation.invitation_id)
                        }
                        className="bg-red-500 text-gray-100 px-4 py-2 rounded border-red-700 border font-bold"
                      >
                        Odrzuć
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
