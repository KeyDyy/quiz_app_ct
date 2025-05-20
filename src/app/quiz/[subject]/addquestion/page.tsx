"use client";
import { useState } from "react";
import useAuthModal from "../../../../../hooks/useAuthModal";
import { useUser } from "../../../../../hooks/useUser";
import { usePathname } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import Button from "@/components/Button";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const AddQuestionPage = () => {
  const pathName = usePathname();
  const match = pathName.match(/\/quiz\/([^/]+)\/addquestion/);
  const subject = match ? match[1] : null;

  const [questionText, setQuestionText] = useState("");
  const [content, setContent] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(-1);

  const { user } = useUser();
  const authModal = useAuthModal();

  const isValidUrl = (url: string) => {
    // Regular expression for a valid URL
    const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*\.(jpg|png)$/i;
    return urlRegex.test(url);
  };


  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();

    if (!user) {
      // Open the authentication modal
      authModal.onOpen();
      return;
    }


    // Check if required fields are provided
    if (!questionText.trim() || options.some(option => !option.trim()) || correctOptionIndex === -1) {
      toast.error('Proszę uzupełnij wszystkie wymagane pola');
      return;
    }

    try {

      // Validate content (optional field)
      if (content && !isValidUrl(content)) {
        toast.error('Proszę wprowadź poprawny adres url obrazka lub pozostaw puste pole');
        return;
      }

      // Validate options length
      if (options.some(option => option.length > 50)) {
        toast.error('Opcje nie powinny składać się z więcej niż 50 znaków');
        return;
      }

      // Validate correctOptionIndex
      if (correctOptionIndex < 0 || correctOptionIndex >= options.length) {
        toast.error('Wybierz poprawną odpowiedź z podanych.');
        return;
      }

      const optionsJSON = JSON.stringify(
        options.filter((option) => option.trim() !== "")
      );

      const { data: quizData, error: quizError } = await supabase
        .from("quizzes")
        .select("quiz_id")
        .eq("description", subject)
        .single();

      if (quizError) {
        throw quizError;
      }
      if (quizData) {
        // Add the question to the Supabase table
        const { data, error } = await supabase.from("Questions").insert([
          {
            quiz_id: quizData.quiz_id,
            question_text: questionText,
            content: content,
            correct_answer: options[correctOptionIndex],
            options: optionsJSON,
            approved: false,
          },
        ]);

        if (error) {
          throw error;
        }
      }
      // Redirect to a success page or do any other necessary actions
      toast.success('Pytanie dodane pomyślnie!');
      //router.push(`/quiz/${subject}`);
    } catch (error) {
      console.error("Error adding question:", error);
      // Handle error, show a message, etc.
      toast.error('Wystąpił problem z dodaniem pytania. Proszę spróbuj ponownie.');
    }
  };

  return (
    <div className="flex bg-gray-100 dark:bg-gray-900  px-8 sm:px-12  md:px-36 lg:px-80 2xl:px-96 py-2 sm:py-8 md:py-4 pb-12">
      <div className="flex-1 ">
        <div className="">
          <div className="mt-5 font-bold text-xl ">
            <form
              onSubmit={handleSubmit}
              className="bg-gray-200 rounded-2xl px-12 pt-8 pb-8 border border-gray-600  shadow-md sm:shadow-2xl"
            >
              <label className="block mb-2 ">
                <p className="mb-1"> Treść pytania: </p>
                <input
                  type="text"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Wprowadź treść pytania"
                  className="border border-gray-400 p-2 w-full rounded-md font-normal bg-gray-100"
                  style={{
                    outline: "none",
                    boxShadow: "0 0 3px rgba(0, 0, 0, 0.5)",
                  }}
                />
              </label>
              <label className="block mb-2">
                <p className="mb-1"> Obrazek (opcjonalnie): </p>
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Wprowadź adres URL obrazka"
                  className="border border-gray-400 p-2 w-full rounded-md font-normal bg-gray-100"
                  style={{
                    outline: "none",
                    boxShadow: "0 0 3px rgba(0, 0, 0, 0.5)",
                  }}
                />
              </label>
              <label className="block mb-2">
                <p className="mb-1"> Opcje: </p>
                {options.map((option, index) => (
                  <div key={index} className="mb-2 font-normal">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => {
                        const updatedOptions = [...options];
                        updatedOptions[index] = e.target.value;
                        setOptions(updatedOptions);
                      }}
                      placeholder={`Opcja ${index + 1}`}
                      className="border border-gray-400 p-2 w-full rounded-md bg-gray-100"
                      style={{
                        outline: "none",
                        boxShadow: "0 0 3px rgba(0, 0, 0, 0.5)",
                      }}
                    />
                  </div>
                ))}
              </label>
              <label className="block mb-2 my-2">
                <p className="mb-1"> Poprawna odpowiedź </p>
                <select
                  value={correctOptionIndex}
                  onChange={(e) =>
                    setCorrectOptionIndex(parseInt(e.target.value, 10))
                  }
                  placeholder="Wybierz poprawną odpowiedź"
                  className="border border-gray-400 p-2 w-full rounded-md font-normal bg-gray-100"
                  style={{
                    outline: "none",
                    boxShadow: "0 0 3px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  <option value={-1} className="">
                    Wybierz poprawną odpowiedź
                  </option>
                  {options.map((_, index) => (
                    <option key={index} value={index} className="font-bold">
                      Opcja {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="submit"
                className="bg-black text-gray-100 p-2 px-8 rounded-xl mt-4 w-auto"
              >
                Dodaj pytanie
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddQuestionPage;

function isValidUrl(content: string) {
  throw new Error("Function not implemented.");
}

