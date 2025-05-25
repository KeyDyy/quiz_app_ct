"use client";
import useAuthModal from "../../hooks/useAuthModal";
import { useUser } from "../../hooks/useUser";
import React from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
//import { supabase } from "@/lib/supabase";
import { getQuizzesData } from "@/lib/fetching";
import Button from "@/components/Button";

interface QuizData {
  logo: string;
  title: string;
  description: string;
}

export default function Home() {
  const router = useRouter();
  const authModal = useAuthModal();
  const { user } = useUser();

  const [data, setData] = useState<QuizData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {

        const quizData = await getQuizzesData();
        setData(quizData);
      } catch (error) {
        console.error("Błąd pobierania danych", error);
      }
    };
    fetchData();
  }, []);

  const handleImageClick = (subject: string) => {
    if (!user) {
      authModal.onOpen();
    } else if (subject === "AI") {
      router.push("/Quized_by_AI");
    } else {
      router.push(`/quiz/${subject.toLowerCase()}`);
    }
  };

  const handleCreateQuiz = () => {
    if (!user) {
      authModal.onOpen();
    } else {
      router.push("/add");
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-900 flex flex-col items-center">
      <div className="w-full max-w-8xl mx-auto p-7">
        <div className="flex justify-end mb-4">
          <Button
            onClick={handleCreateQuiz}
            className="bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-800 transition-colors"
          >
            Stwórz nowy quiz
          </Button>
        </div>
        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {data
            .sort((a, b) =>
              a.description === "AI" ? -1 : b.description === "AI" ? 1 : 0
            )
            .map((quiz: QuizData) => (
              <div
                key={quiz.title}
                className="bg-zinc-50 dark:bg-gray-900 p-4 pb-1 rounded-2xl shadow-md border border-gray-200"
              >
                <a onClick={() => handleImageClick(quiz.description)}>
                  <img
                    src={quiz.logo}
                    alt={quiz.title}
                    className="w-120 mx-auto rounded-2xl"
                  />
                </a>
                <p className="mt-1 text-center font-serif font-semibold">{quiz.title}</p>
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}
