"use client";
import { useState } from "react";
import useAuthModal from "../../../hooks/useAuthModal";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../lib/supabase";
import Button from "@/components/Button";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useRouter } from "next/navigation";

const AddQuizPage = () => {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const router = useRouter();

    const { user } = useUser();
    const authModal = useAuthModal();

    const isValidUrl = (url: string) => {
        if (!url) return true; // Allow empty URL
        const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*\.(jpg|jpeg|png|gif|webp)$/i;
        return urlRegex.test(url);
    };

    const handleSubmit = async (e: { preventDefault: () => void }) => {
        e.preventDefault();

        if (!user) {
            authModal.onOpen();
            return;
        }

        // Validate required fields
        if (!title.trim()) {
            toast.error('Proszę wprowadź nazwę quizu');
            return;
        }

        // Validate title length
        if (title.length > 100) {
            toast.error('Nazwa quizu nie może przekraczać 100 znaków');
            return;
        }

        // Validate image URL if provided
        if (imageUrl && !isValidUrl(imageUrl)) {
            toast.error('Proszę wprowadź poprawny adres URL obrazka (jpg, jpeg, png, gif, webp)');
            return;
        }

        try {
            // Check if quiz with this title already exists
            const { data: existingQuiz, error: checkError } = await supabase
                .from("quizzes")
                .select("quiz_id, title")
                .eq("title", title)
                .maybeSingle();

            if (checkError) {
                console.error("Error checking existing quiz:", checkError);
                throw new Error("Błąd podczas sprawdzania istniejącego quizu");
            }

            if (existingQuiz) {
                toast.error('Quiz o takiej nazwie już istnieje');
                return;
            }

            // If description is provided, check if it's unique
            if (description.trim()) {
                const { data: existingDesc, error: descError } = await supabase
                    .from("quizzes")
                    .select("quiz_id, description")
                    .eq("description", description)
                    .maybeSingle();

                if (descError) {
                    console.error("Error checking existing description:", descError);
                    throw new Error("Błąd podczas sprawdzania istniejącego opisu");
                }

                if (existingDesc) {
                    toast.error('Quiz o takim opisie już istnieje');
                    return;
                }
            }

            // Add the quiz to the Supabase table
            const { data: newQuiz, error: insertError } = await supabase
                .from("quizzes")
                .insert({
                    title: title.trim(),
                    description: description.trim() || null,
                    creator_user_id: user.id,
                    logo: imageUrl.trim() || "tuwstawswojamorde.png"
                })
                .select()
                .single();

            if (insertError) {
                console.error("Error inserting quiz:", insertError);
                throw new Error("Błąd podczas dodawania quizu");
            }

            if (!newQuiz) {
                throw new Error("Nie otrzymano danych po dodaniu quizu");
            }

            toast.success('Quiz dodany pomyślnie!');

            // Redirect to add questions page using either description or title as the identifier
            const quizIdentifier = description.trim() || title.toLowerCase().replace(/\s+/g, '-');
            router.push(`/quiz/${quizIdentifier}/addquestion`);

        } catch (error) {
            console.error("Error adding quiz:", error);
            toast.error('Wystąpił problem z dodaniem quizu. Proszę spróbuj ponownie.');
        }
    };

    return (
        <div className="flex bg-gray-100 dark:bg-gray-900 px-8 sm:px-12 md:px-36 lg:px-80 2xl:px-96 py-2 sm:py-8 md:py-4 pb-12">
            <div className="flex-1">
                <div className="">
                    <div className="mt-5 font-bold text-xl">
                        <form
                            onSubmit={handleSubmit}
                            className="bg-gray-200 rounded-2xl px-12 pt-8 pb-8 border border-gray-600 shadow-md sm:shadow-2xl"
                        >
                            <label className="block mb-2">
                                <p className="mb-1">Nazwa quizu:</p>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Wprowadź nazwę quizu"
                                    className="border border-gray-400 p-2 w-full rounded-md font-normal bg-gray-100"
                                    style={{
                                        outline: "none",
                                        boxShadow: "0 0 3px rgba(0, 0, 0, 0.5)",
                                    }}
                                    maxLength={100}
                                    required
                                />
                                <p className="text-sm text-gray-600 mt-1">
                                    Nazwa quizu musi być unikalna i nie może przekraczać 100 znaków.
                                </p>
                            </label>

                            <label className="block mb-2">
                                <p className="mb-1">Opis quizu (opcjonalny):</p>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                                    placeholder="Wprowadź opis quizu"
                                    className="border border-gray-400 p-2 w-full rounded-md font-normal bg-gray-100"
                                    style={{
                                        outline: "none",
                                        boxShadow: "0 0 3px rgba(0, 0, 0, 0.5)",
                                    }}
                                />
                                <p className="text-sm text-gray-600 mt-1">
                                    Opis jest opcjonalny.
                                </p>
                            </label>

                            <label className="block mb-2">
                                <p className="mb-1">URL obrazka (opcjonalny):</p>
                                <input
                                    type="text"
                                    value={imageUrl}
                                    onChange={(e) => setImageUrl(e.target.value)}
                                    placeholder="Wprowadź adres URL obrazka (jpg, jpeg, png, gif, webp)"
                                    className="border border-gray-400 p-2 w-full rounded-md font-normal bg-gray-100"
                                    style={{
                                        outline: "none",
                                        boxShadow: "0 0 3px rgba(0, 0, 0, 0.5)",
                                    }}
                                />
                                <p className="text-sm text-gray-600 mt-1">
                                    URL obrazka jest opcjonalny. Jeśli nie zostanie podany, zostanie użyty domyślny obrazek.
                                </p>
                            </label>

                            <Button
                                type="submit"
                                className="bg-black text-gray-100 p-2 px-8 rounded-xl mt-4 w-auto"
                            >
                                Utwórz quiz
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddQuizPage;

