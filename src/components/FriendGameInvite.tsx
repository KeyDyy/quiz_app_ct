"use client";
import React, { useEffect, useState } from "react";
import { useUser } from "@/../hooks/useUser";
import { supabase } from "@/lib/supabase";
import Button from "./Button";
import { toast } from 'react-toastify';
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from 'uuid';

interface Friend {
  user1: string;
  user2: any;
  userId: string;
  username: string;
  status: string;
  avatar?: string;
}

const FriendGameInvite = () => {
  const { user } = useUser();
  const [friends, setFriends] = useState<Friend[]>([]);
  const router = useRouter();
  const pathName = usePathname();

  const match = pathName.match(/\/quiz\/([^/]+)/);

  const subject = match ? match[1] : null;

  useEffect(() => {
    if (user) {
      fetchFriends(user.id);
    }
  }, [user]);

  const fetchFriends = async (userId: string) => {
    try {
      const { data: friendsData, error } = await supabase
        .from("friends")
        .select("user1, user2, status")
        .or(`user1.eq.${userId},user2.eq.${userId}`);

      if (error) {
        console.error("Error fetching friends:", error);
        return;
      }

      const uniqueFriendData: Friend[] = [];

      for (const friend of friendsData as unknown as Friend[]) {
        const friendId = friend.user1 === userId ? friend.user2 : friend.user1;
        const status = friend.status;

        const existingFriend = uniqueFriendData.find(
          (f) => f.userId === friendId
        );
        if (!existingFriend) {
          const userData = await supabase
            .from("users")
            .select("username, avatar_url")
            .eq("id", friendId)
            .single();

          if (!userData.error) {
            const image = userData.data?.avatar_url;
            uniqueFriendData.push({
              userId: friendId,
              username: userData.data?.username || "N/A",
              status: status,
              avatar: image || "N/A",
              user1: "",
              user2: undefined,
            });
          }
        }
      }

      setFriends(uniqueFriendData);
    } catch (error) {
      console.error("Error fetching friends:", error);
    }
  };

  const createGameInvitation = async (receiverUserId: any) => {
    try {
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .select('quiz_id')
        .eq('description', subject)
        .single();

      if (quizError) {
        throw quizError;
      }

      // Check if a pending invitation already exists between the sender and receiver
      const { data: existingInvitations, error: existingError } = await supabase
        .from('GameInvitations')
        .select()
        .eq('sender_user_id', user?.id)
        .eq('receiver_user_id', receiverUserId)
        .eq('status', 'Pending');

      if (existingError) {
        console.error('Error checking existing invitations:', existingError);
        return;
      }

      if (existingInvitations.length > 0) {
        // Handle the case where there's an existing pending invitation
        toast.error('There is already a pending invitation between you and this user.');
        return;
      }
      let invitation_id = uuidv4();
      // Create a new game invitation with the chosen quizDesc
      const { data: invitationData, error: invitationError } = await supabase
        .from('GameInvitations')
        .upsert([
          {
            invitation_id: invitation_id,
            sender_user_id: user?.id,
            receiver_user_id: receiverUserId,
            status: 'Pending',
            quiz_id: quizData.quiz_id, // Add quiz_id to the invitation
          },
        ]);

      if (invitationError) {
        console.error('Error creating game invitation:', invitationError);
        return;
      }

      let game_id = uuidv4();
      // Use the obtained invitation_id to create a record in the MultiplayerGame table
      const { data: multiplayerGameData, error: multiplayerGameError } = await supabase
        .from('MultiplayerGame')
        .insert({
          game_id: game_id,
          quiz_id: quizData.quiz_id,
          invitation_id: invitation_id, // Use the obtained invitation_id
          //start_time: new Date(),
          // You may need to adjust the other fields based on your requirements
        });

      if (multiplayerGameError) {
        console.error('Error creating MultiplayerGame record:', multiplayerGameError);
        return;
      }


      if (game_id) {
        router.push(`/quiz/multi/${game_id}`);
      }

      // Handle successful invitation creation
      toast.success('Game invitation sent successfully.');
    } catch (error) {
      console.error('Error creating game invitation:', error);
    }
  };


  return (
    <div className="relative flex bg-gray-100 dark:bg-gray-900">
      {/* Sekcja 1: Górna lewa strona */}
      <div className="flex-1">
        {user && (
          <div className="flex-1 overflow-y-auto">
            <div className="friend-section mt-5">
              {friends.length > 0 ? (
                <ul>
                  {/* Mapowanie przez zaakceptowanych przyjaciół i wyświetlanie ich */}
                  {friends
                    .filter((friend) => friend.status === "Accepted")
                    .map((friend) => (
                      <li
                        key={friend.userId}
                        className="flex items-center justify-between bg-gray-200 p-6 lg:px-12 rounded-2xl border border-gray-300 my-1 "
                      >
                        <img
                          src={
                            friend.avatar ||
                            "https://t4.ftcdn.net/jpg/05/49/98/39/360_F_549983970_bRCkYfk0P6PP5fKbMhZMIb07mCJ6esXL.jpg"
                          }
                          alt="Avatar"
                          className="avatar w-10 h-10 rounded-full mr-2"
                        />
                        <div className="flex-1">
                          <p className="font-bold mr-12">{friend.username}</p>
                        </div>
                        <Button
                          className="bg-black text-gray-100 px-6 w-auto"
                          onClick={() =>
                            createGameInvitation(
                              friend.userId,
                            )
                          }
                        >
                          Zaproś
                        </Button>
                      </li>
                    ))}
                </ul>
              ) : (

                <p className="text-center text-black font-bold p-4 flex">Brak znajomych</p>

              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FriendGameInvite;
