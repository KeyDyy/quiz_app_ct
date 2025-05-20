// pages/quiz.tsx
"use client";
import { useState, useEffect } from "react";
import { NextPage } from "next";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/../hooks/useUser";
import { useRouter, usePathname } from "next/navigation";
import Button from "@/components/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Question {
  question_id: number;
  quiz_id: number;
  question_text: string | null;
  content: string | null;
  correct_answer: string;
  options: any[] | null; // Adjust the type as per your requirements
}

const QuizPage: NextPage = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(
    null
  );
  const [answered, setAnswered] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [isLastQuestion, setIsLastQuestion] = useState<boolean>(false);
  const { user } = useUser();

  const [correctAnswers, setCorrectAnswers] = useState<number>(0);
  const [incorrectAnswers, setIncorrectAnswers] = useState<number>(0);

  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const pathName = usePathname();

  const match = pathName.match(/\/quiz\/([^/]+)\/sologame/);

  const subject = match ? match[1] : null;
  const currentQuestion = questions[currentQuestionIndex];

  // useEffect(() => {
  //   if (!user) {
  //     // Open the authentication modal
  //     router.push("/");
  //     return;
  //   }
  // }
  // )

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        // Fetch the quiz based on the subject
        const { data: quizData, error: quizError } = await supabase
          .from("quizzes")
          .select("quiz_id")
          .eq("description", subject)
          .single();

        if (quizError) {
          throw quizError;
        }

        if (quizData) {
          // Fetch questions associated with the quiz_id
          const { data: questionsData, error: questionsError } = await supabase
            .from("random_questions")
            .select("*")
            .eq("quiz_id", quizData.quiz_id)
            .limit(5);

          if (questionsError) {
            throw questionsError;
          }

          if (questionsData) {
            // Parse options from JSON structure or use as is if already an array
            const questionsWithParsedOptions = questionsData.map(
              (question) => ({
                ...question,
                options: Array.isArray(question.options)
                  ? question.options
                  : JSON.parse(question.options || "[]"), // Default to an empty array if options is null
              })
            );

            setQuestions(questionsWithParsedOptions);
          }
        }
      } catch (error) {
        console.error("Error fetching questions:", error);
      } finally {
        // Set loading to false when questions are fetched
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [subject]);

  const [timer, setTimer] = useState<number>(10); // 10 seconds initially

  useEffect(() => {
    let timerInterval: NodeJS.Timeout;

    // Define a function to decrement the timer
    const decrementTimer = () => {
      setTimer((prevTimer) => prevTimer - 1);
    };

    // Start the timer when a new question is loaded
    if (currentQuestion) {
      setTimer(10); // Reset timer for each new question
      timerInterval = setInterval(decrementTimer, 1000); // Update timer every second
    }

    // Clean up the timer interval when component unmounts or question changes
    return () => {
      clearInterval(timerInterval);
    };
  }, [currentQuestion]);

  // Check if time is up and move to the next question
  useEffect(() => {
    if (timer === 0) {
      handleSelectAnswer(""); // Consider the question as incorrectly answered
    }
  }, [timer]);

  const handleSelectAnswer = (selectedAnswer: string) => {
    if (!answered) {
      const isCorrectAnswer = selectedAnswer === currentQuestion.correct_answer;

      // Update the counters based on the correctness of the selected answer
      if (isCorrectAnswer) {
        setCorrectAnswers((prevCorrectAnswers) => prevCorrectAnswers + 1);
      } else {
        setIncorrectAnswers((prevIncorrectAnswers) => prevIncorrectAnswers + 1);
      }

      // Update the score based on the correctness of the selected answer
      setScore((prevScore) =>
        isCorrectAnswer ? prevScore + 1 : prevScore - 1
      );

      // Check if this is the last question
      if (currentQuestionIndex === questions.length - 1) {
        setIsLastQuestion(true);
      }

      // Mark the question as answered
      setAnswered(true);
      handleNextQuestion();
    }
  };

  const handleNextQuestion = () => {
    //console.log('Handling next question...');
    if (isLastQuestion) {
      // console.log('Last question reached.');
      // Handle the end of the quiz (e.g., save score to the server)
      if (!user || !user.id) {
        //console.log("Użytkownik nie jest zalogowany lub brakuje identyfikatora.");
      } else {
        // Insert your logic here to save the score to the server
        setQuizCompleted(true);
      }
    } else {
      //console.log('Moving to the next question...');
      const nextQuestionIndex = currentQuestionIndex + 1;

      // Check if there are more questions
      if (nextQuestionIndex < questions.length) {
        setCurrentQuestionIndex(nextQuestionIndex);
        setSelectedAnswerIndex(null);
        setAnswered(false);
        setIsLastQuestion(nextQuestionIndex === questions.length - 1);
      } else {
        // If there are no more questions, handle the end of the quiz
        setQuizCompleted(true);
      }
    }
  };

  const handlePlayAgain = () => {
    // Refresh the page or perform any other logic
    router.push("/");
  };

  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);

  useEffect(() => {
    // Shuffle options when a new question is loaded
    if (currentQuestion) {
      const optionsCopy = currentQuestion.options
        ? [...currentQuestion.options]
        : [];
      const newShuffledOptions = optionsCopy.sort(() => Math.random() - 0.5);
      setShuffledOptions(newShuffledOptions);
    }
  }, [currentQuestion]);

  const renderQuestion = () => {
    //console.log('Rendering question...');
    //console.log('currentQuestionIndex:', currentQuestionIndex);
    //console.log('questions:', questions);

    return (
      <div className="flex justify-center pb-12">
        <div className="flex flex-col mt-16 m-6 h-max bg-gray-200 p-12 border-2 border-gray-600 rounded-2xl shadow-2xl">
          <div className="center-content font-sans text-center">
            {currentQuestion ? (
              <>
                <div className="text-2xl font-bold mb-6 flex justify-center">
                  {currentQuestion.question_text}
                </div>
                {currentQuestion.content && (
                  <div className="question-image">
                    {currentQuestion.content.endsWith(".jpg") ||
                    currentQuestion.content.endsWith(".png") ? (
                      <img
                        src={currentQuestion.content}
                        alt="Question"
                        className="max-w-full h-auto"
                      />
                    ) : (
                      <iframe
                        width="560"
                        height="315"
                        src={currentQuestion.content}
                        title="Question Video"
                        allowFullScreen
                        className="max-w-full"
                      />
                    )}
                  </div>
                )}

                <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-4">
                  {shuffledOptions.map((option: any, index: number) => (
                    <li
                      key={index}
                      onClick={() => handleSelectAnswer(option)}
                      className={`bg-white m-2 rounded-lg border-2 border-b-4 border-r-4 border-black px-2 py-1 text-xl font-bold transition-all hover:-translate-y-[2px] md:block dark:border-white 
                          ${
                            selectedAnswerIndex === index
                              ? "selected incorrect"
                              : ""
                          }`}
                      style={{ cursor: "pointer" }}
                    >
                      <strong>{String.fromCharCode(65 + index)}</strong> -{" "}
                      {option}
                    </li>
                  ))}
                </ul>

                <div className="text-lg font-bold mb-2 text-center mt-4">
                  Pozostały czas: {timer}
                </div>

                <div className="relative pt-1">
                  <div className="flex h-3 mb-4 m-1 m overflow-hidden border-2 border-gray-800 rounded-xl">
                    <div
                      className="w-full bg-black transition-all duration-1000 ease-linear"
                      style={{
                        width: `${timer === 10 ? "100%" : `${(timer - 1) * 11}%`}`,
                      }}
                    ></div>
                  </div>
                </div>
              </>
            ) : (
              <div>Loading...</div>
            )}
          </div>
        </div>
      </div>
    );
  };
  const renderResults = () => {
    return (
      <div className="flex justify-center mt-6">
        <Card className="flex flex-col mt-12 m-6 h-max lg:p-8 p-4 rounded-2xl border shadow-2xl border-gray-400">
          <CardHeader>
            <CardTitle>Quiz ukończony</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-black">
              Poprawne odpowiedzi: {correctAnswers}
            </CardDescription>
            <CardDescription className="text-black">
              Niepoprawne odpowiedzi: {incorrectAnswers}
            </CardDescription>
          </CardContent>

          <Button className="bg-black text-white" onClick={handlePlayAgain}>
            Zagraj jeszcze raz!
          </Button>
        </Card>
      </div>
    );
  };

  return (
    <div>
      {loading
        ? "Loading..."
        : quizCompleted
        ? renderResults()
        : renderQuestion()}
    </div>
  );
};

export default QuizPage;
