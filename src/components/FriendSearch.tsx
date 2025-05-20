"use client";
import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { useUser } from "../../hooks/useUser";
import { Button } from "./ui/button";
import { toast } from 'react-toastify';

type FoundUser = {
  id: string;
  full_name: string | null;
  username: string;
  avatar_url: string | null;
};

const InviteFriend = () => {
  const { user } = useUser();
  const [username, setUsername] = useState("");
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    setFoundUser(null); // Reset foundUser when the username changes
  };

  const findUser = async () => {
    try {
      if (username) {
        const { data, error } = await supabase
          .from("users")

          .select("id, full_name, username, avatar_url")
          .like("username", `%${username}%`)
          .single();

        if (error) {
          //throw new Error('Error finding user:', error);
        }

        if (data) {
          setFoundUser(data);
        } else {
          setFoundUser(null);
        }
      } else {
        // Throw an error if the input is empty or not provided.
        throw new Error("Username is required.");
      }
    } catch (error) {
      console.error("Error finding user:", error);
    }
  };

  const inviteFriend = async () => {
    if (foundUser && user) {
      try {
        //console.log("user object:", user); // Debugging statement to inspect the user object
        //console.log("user ID", user.id);

        // Check if an invite already exists from user1 to user2 with status "Pending"
        const existingInviteUser1ToUser2 = await supabase
          .from("friends")
          .select("id,user1,user2")
          .eq("user1", user.id)
          .eq("user2", foundUser.id)
          .single();

        // Check if an invite already exists from user2 to user1 with status "Pending"
        const existingInviteUser2ToUser1 = await supabase
          .from("friends")
          .select("id,user1,user2")
          .eq("user1", foundUser.id)
          .eq("user2", user.id)
          .single();

        if (
          existingInviteUser1ToUser2.data ||
          existingInviteUser2ToUser1.data
        ) {
          console.log("Friend invitation already exists.");
          // Show an alert or handle this case as needed.
          toast.error("Zaproszenie do znajomych już istnieje");
        } else {
          // If no existing invite is found, create a new record in the "friends" table.
          const { error } = await supabase.from("friends").upsert([
            {
              user1: user.id, // Currently logged user as user1
              user2: foundUser.id,
              status: "Pending",
            },
          ]);

          if (error) {
            console.error("Error sending friend invitation:", error);
          } else {
            toast.success("Zaproszenie wysłane pomyślnie.");
          }
        }
      } catch (error) {
        console.error("Error inviting friend:", error);
      }
    }
  };

  return (
    <div className="">
      {user && (
        <div className="">
          <h2 className="text-2xl font-bold mb-2"> Wyszukaj znajomego </h2>
          <div className="flex items-center space-x-2 w-full ">
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              className="input w-full p-2 border-2 border-gray-400 rounded-lg "
              placeholder="Wprowadź nick znajomego"
              style={{
                outline: "none",
                boxShadow: "0 0 3px rgba(0, 0, 0, 0.5)",
              }}
            />
            <Button
              onClick={findUser}
              className="p-2 bg-black text-white w-auto text-md"
            >
              Szukaj
            </Button>
          </div>
          {foundUser && (
            <div className="mt-4">
              <h3 className="text-xl font-bold py-2"> Znaleziony użytkownik</h3>
              <div className="flex">
                <img
                  src={
                    foundUser.avatar_url ||
                    "https://t4.ftcdn.net/jpg/05/49/98/39/360_F_549983970_bRCkYfk0P6PP5fKbMhZMIb07mCJ6esXL.jpg"
                  }
                  alt="Avatar"
                  className="avatar w-12 h-12 rounded-full mr-2 flex"
                />

                <div className="mx-2">
                  <p>Użytkownik: {foundUser.username}</p>
                  <p>Pełna nazwa: {foundUser.full_name || "N/A"}</p>
                </div>
                <Button
                  onClick={inviteFriend}
                  className="my-2 mx-4 py-4 px-2 bg-black text-white w-auto flex "
                >
                  Zaproś
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InviteFriend;
