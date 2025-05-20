"use client";

import { useEffect } from "react";
import { useUser } from "../../hooks/useUser";
import { useRouter } from "next/navigation";

export function useUserAuth() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      router.push("/");
    }
  }, [user, router]);

  return user;
}
