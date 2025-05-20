"use client";
import { useState, useEffect } from "react";
import { NextPage } from "next";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "@/../hooks/useUser";
import Button from "@/components/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import moment from "moment";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface CountdownTimerProps {
  startTime: string; // Timestamp in string format, e.g., "2024-01-03T14:23:21.823"
}

interface Answer {
  game_id: string;
  user_id: string;
  question_id: number;
  // ... other properties if applicable
}

// interface questionsJson {
//     question_id: number;
//     quiz_id: number;
//     question_text: string | null;
//     content: string | null;
//     correct_answer: string;
//     options: any[] | null; // Adjust the type as per your requirements
// }

const MultiplayerGame: NextPage = () => {
  const { user } = useUser();
  const router = useRouter();
  const [senderUserId, setSenderUserId] = useState("");
  const [senderUsername, setSenderUsername] = useState("");
  const [senderAvatarUrl, setSenderAvatarUrl] = useState("");
  const [receiverUserId, setReceiverUserId] = useState("");
  const [receiverUsername, setReceiverUsername] = useState("");
  const [receiverAvatarUrl, setReceiverAvatarUrl] = useState("");
  const [invitationStatus, setInvitationStatus] = useState("");

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(
    null
  );
  const [answered, setAnswered] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [isLastQuestion, setIsLastQuestion] = useState<boolean>(false);

  const [correctAnswers, setCorrectAnswers] = useState<number>(0);
  const [incorrectAnswers, setIncorrectAnswers] = useState<number>(0);

  const [receiverConnected, setReceiverConnected] = useState<boolean>(false);

  const [startTime, setStartTime] = useState<number | null>(null);

  const pathName = usePathname();

  const match = pathName.match(/\/multi\/([^/]+)/);
  const gameId = match ? match[1] : null;

  // useEffect(() => {
  //     if (!user) {
  //         // Open the authentication modal
  //         router.push("/");
  //         return;
  //     }
  // }
  // )

  useEffect(() => {
    const fetchGameData = async () => {
      // Fetch multiplayer game data
      const { data: multiplayerGameData, error: multiplayerGameError } =
        await supabase
          .from("MultiplayerGame")
          .select("game_id, quiz_id, invitation_id, start_time, winner_user_id")
          .eq("game_id", gameId)
          .single();

      if (multiplayerGameError) {
        console.error(
          "Error fetching multiplayer game data:",
          multiplayerGameError
        );
        return;
      }

      // Fetch receiver's user information
      const invitationId = multiplayerGameData?.invitation_id;
      const { data: invitationData, error: invitationError } = await supabase
        .from("GameInvitations")
        .select("status, receiver_user_id, sender_user_id") // Add user_id to the selection
        .eq("invitation_id", invitationId)
        .single();

      if (invitationError) {
        console.error("Error fetching invitation data:", invitationError);
        return;
      }

      const senderUserId = invitationData?.sender_user_id; // adjust based on your Supabase schema
      const { data: senderUserData, error: senderUserError } = await supabase
        .from("users")
        .select("id, username, avatar_url")
        .eq("id", senderUserId)
        .single();

      if (senderUserError) {
        console.error("Error fetching sender user data:", senderUserError);
        return;
      }
      setSenderUserId(senderUserData?.id || "");
      setSenderUsername(senderUserData?.username || "");
      setSenderAvatarUrl(senderUserData?.avatar_url || "");

      console.log(senderUsername);

      setInvitationStatus(invitationData?.status || "");

      if (invitationData?.status === "Accepted") {
        const receiverUserId = invitationData?.receiver_user_id || "";
        const { data: receiverUserData, error: receiverUserError } =
          await supabase
            .from("users")
            .select("id, username, avatar_url")
            .eq("id", receiverUserId)
            .single();

        const { data: multiplayerGameData, error: multiplayerGameError } =
          await supabase
            .from("MultiplayerGame")
            .select(
              "game_id, quiz_id, invitation_id, start_time, winner_user_id"
            )
            .eq("game_id", gameId)
            .single();

        if (multiplayerGameError) {
          console.error(
            "Error fetching multiplayer game data:",
            multiplayerGameError
          );
          return;
        }
        console.log(multiplayerGameData.start_time);

        // Receiver user has connected to the game
        setReceiverConnected(true);

        if (receiverUserError) {
          console.error(
            "Error fetching receiver user data:",
            receiverUserError
          );
          return;
        }

        setReceiverUserId(receiverUserData?.id || "");
        setReceiverUsername(receiverUserData?.username || "");
        setReceiverAvatarUrl(receiverUserData?.avatar_url || "");

        setStartTime(multiplayerGameData?.start_time || null);
      }
    };

    const channel = supabase
      .channel("table-db-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "GameInvitations",
        },
        (payload) => {
          fetchGameData();
        }
      )
      .subscribe();

    fetchGameData();
  }, [gameId]);

  const [questions, setQuestions] = useState<
    {
      question_id: number;
      question_text: string;
      content: string;
      correct_answer: string;
      options: any;
    }[]
  >([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        // Fetch the quiz based on the subject
        const { data: multiplayerGameData, error: multiplayerGameError } =
          await supabase
            .from("MultiplayerGame")
            .select(
              "game_id, quiz_id, invitation_id, winner_user_id, questions"
            )
            .eq("game_id", gameId)
            .single();

        if (multiplayerGameError) {
          console.error(
            "Error fetching multiplayer game data:",
            multiplayerGameError
          );
          return;
        }

        if (multiplayerGameData) {
          if (multiplayerGameData.questions) {
            // If there is data in the questions column, use it directly
            setQuestions(multiplayerGameData.questions);
          } else {
            // Fetch questions associated with the quiz_id
            const { data: questionsData, error: questionsError } =
              await supabase
                .from("random_questions")
                .select("*")
                .eq("quiz_id", multiplayerGameData.quiz_id)
                .limit(5);

            if (questionsError) {
              throw questionsError;
            }

            if (questionsData) {
              // Store the questions in a JSON structure
              const questionsJson = questionsData.map((question) => ({
                question_id: question.question_id,
                question_text: question.question_text,
                content: question.content,
                correct_answer: question.correct_answer,
                options: Array.isArray(question.options)
                  ? question.options
                  : JSON.parse(question.options || "[]"), // Default to an empty array if options is null
              }));

              // Insert the questions into the MultiplayerGame table only if questions column is null
              await supabase
                .from("MultiplayerGame")
                .update({
                  questions: questionsJson,
                })
                .eq("game_id", gameId);

              setQuestions(questionsJson);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching and storing questions:", error);
      } finally {
        // Set loading to false when questions are fetched and stored
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [gameId]);

  const currentQuestion = questions[currentQuestionIndex];

  const [timeRemaining, setTimeRemaining] = useState<string>("");

  useEffect(() => {
    const targetTime = moment(startTime).add(3615, "seconds");
    const intervalId = setInterval(() => {
      const now = moment();
      const duration = moment.duration(targetTime.diff(now));
      const formattedTime = `${duration.hours()}:${duration.minutes()}:${duration.seconds()}`;

      if (now.isBefore(targetTime)) {
        setTimeRemaining(formattedTime);
      } else {
        // Countdown reached, you may want to perform some action here
        setTimeRemaining("Licznik");
        clearInterval(intervalId);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [startTime]);

  const [timer, setTimer] = useState<number>(30); // 10 seconds initially

  useEffect(() => {
    let timerInterval: NodeJS.Timeout;

    // Define a function to decrement the timer
    const decrementTimer = () => {
      setTimer((prevTimer) => prevTimer - 1);
    };

    // Start the timer when a new question is loaded and the first timer has expired
    if (currentQuestion && timeRemaining === "Licznik") {
      setTimer(10); // Reset timer for each new question
      timerInterval = setInterval(decrementTimer, 1000); // Update timer every second
    }

    // Clean up the timer interval when component unmounts or question changes
    return () => {
      clearInterval(timerInterval);
    };
  }, [currentQuestion, timeRemaining]);

  // Check if time is up and move to the next question
  useEffect(() => {
    if (timer === 0) {
      handleSelectAnswer(""); // Consider the question as incorrectly answered
    }
  }, [timer]);

  const handleSelectAnswer = async (selectedAnswer: string) => {
    if (!answered) {
      const isCorrectAnswer = selectedAnswer === currentQuestion.correct_answer;

      // Update the state to reflect the answer
      setAnswered(true);

      // Insert the answer into the database
      await supabase.from("GameAnswers").upsert([
        {
          game_id: gameId,
          user_id: user?.id,
          question_id: currentQuestion.question_id,
          is_correct: [isCorrectAnswer],
        },
      ]);

      const channel = supabase
        .channel("table-db-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "GameAnswers",
          },
          (payload) => {
            hasBothPlayersAnswered().then((bothAnswered) => {
              if (bothAnswered) {
                handleNextQuestion();
              }
            });
          }
        )
        .subscribe();

      // Check if both players have answered
      const bothAnswered = await hasBothPlayersAnswered();

      // If both players have answered, move to the next question
      if (bothAnswered) {
        handleNextQuestion();
      }
    }
  };

  const [winnerUsername, setWinnerUsername] = useState<string | null>(null);

  const handleNextQuestion = async () => {
    const nextQuestionIndex = currentQuestionIndex + 1;

    if (nextQuestionIndex < questions.length) {
      setCurrentQuestionIndex(nextQuestionIndex);
      setSelectedAnswerIndex(null);
      setAnswered(false);
      setIsLastQuestion(nextQuestionIndex === questions.length - 1);
    } else {
      await updateScores();
      updateScores();
      // Find the winner or check for a draw
      let winnerUserId: string | null = null;

      const highestScore = Math.max(...Object.values(scores));

      const winners = Object.entries(scores).filter(
        ([userId, score]) => score === highestScore
      );

      if (winners.length === 1) {
        // Single winner
        winnerUserId = winners[0][0];
      } else {
        // Draw
        winnerUserId = "draw";
      }

      // Check if a winner already exists in the database
      const { data: existingWinnerData, error: existingWinnerError } =
        await supabase
          .from("MultiplayerGame")
          .select("winner_user_id")
          .eq("game_id", gameId);

      const existingWinnerUserId = existingWinnerData?.[0]?.winner_user_id;

      if (existingWinnerUserId === null) {
        // No winner exists in the database, proceed to update
        await supabase
          .from("MultiplayerGame")
          .update({
            winner_user_id: winnerUserId,
          })
          .eq("game_id", gameId);
      } else {
        // A winner already exists in the database
        // Show a toast notification or handle it as needed
        toast.error("Ten Quiz został już wcześniej ukończony");
      }

      // console.log("sender :", senderUserId)
      // console.log("receiver :", receiverUserId)
      // console.log("winner :", winnerUserId)

      if (winnerUserId == senderUserId) {
        let senderiswinner = "Wygrał " + senderUsername
        setWinnerUsername(senderiswinner);
      } else if (winnerUserId == receiverUserId) {
        let receiveriswinner = "Wygrał " + receiverUsername
        setWinnerUsername(receiveriswinner);
      } else if (winnerUserId == "draw") {

        setWinnerUsername("Remis");
      }

      setQuizCompleted(true);
      updateScores()
    }
  };

  const hasBothPlayersAnswered = async () => {
    // Perform a real-time query on the database to check if both players have answered the current question
    const { data, error } = await supabase
      .from("GameAnswers")
      .select("user_id")
      .eq("game_id", gameId)
      .eq("question_id", currentQuestion.question_id);

    if (error) {
      console.error("Error checking if both players have answered:", error);
      return false;
    }

    // Check if both players have answered by comparing the number of distinct user IDs
    const uniqueUserIds = new Set(data.map((answer) => answer.user_id));
    const bothAnswered = uniqueUserIds.size === 2;

    if (bothAnswered) {
      await updateScores();
    }

    return bothAnswered;
  };

  const [scores, setScores] = useState<Record<string, number>>({});

  const updateScores = async () => {
    // Check if currentQuestion is defined
    if (!currentQuestion || !currentQuestion.question_id) {
      console.error("Current question is undefined or has no question_id");
      return;
    }

    // Retrieve all answers for the current question
    const { data: answers, error: answersError } = await supabase
      .from("GameAnswers")
      .select("*")
      .eq("game_id", gameId)
      .eq("question_id", currentQuestion.question_id);

    if (answersError) {
      console.error("Error retrieving answers:", answersError);
      return;
    }

    // Calculate scores for each player and accumulate over time
    const updatedScores: Record<string, number> = { ...scores };
    answers.forEach((answer) => {
      const userId = answer.user_id;
      const isCorrect = answer.is_correct[0]; // Directly use the boolean value

      // Increment the score if the answer is correct
      updatedScores[userId] =
        (updatedScores[userId] || 0) + (isCorrect ? 1 : 0);
    });

    // Update scores in the state with a callback
    setScores((prevScores) => {
      const newScores = { ...prevScores, ...updatedScores };

      // Display scores for the entire game
      //console.log('Scores:', newScores);
      return newScores;
    });
  };

  // Ensure currentQuestion is defined before calling updateScores
  useEffect(() => {
    if (currentQuestion || isLastQuestion) {
      updateScores();
    }
  }, [currentQuestion, gameId]);

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

  const handlePlayAgain = () => {
    // Refresh the page or perform any other logic
    router.push("/");
  };

  const renderQuestion = () => {
    if (!receiverConnected || startTime === null) {
      // Display loading screen while waiting for the receiver user to connect
      return (
        <div className="flex justify-center items-center pt-80">
          <p className="text-xl px-4">Oczekiwanie na drugiego gracza...</p>
        </div>
      );
    } // Display countdown timer before starting the quiz
    else if (timeRemaining != "Licznik") {
      return (
        <div className="flex justify-center items-center pt-80">
          <p className="text-xl px-4">
            Przygotuj się! Twój Quiz zacznie się za {timeRemaining}
          </p>
        </div>
      );
    } else {
      return (
        <div className="flex justify-center pb-12">
          <div className="flex flex-col mt-16 m-6 h-max bg-gray-200 p-12 border-2 border-gray-600 rounded-2xl shadow-2xl">
            <div className="center-content font-sans text-center">
              {currentQuestion ? (
                <>
                  {/* Display user avatars and usernames here */}
                  <div className="flex justify-between mb-4">
                    <div className="flex flex-col items-center">
                      <img
                        src={senderAvatarUrl}
                        alt="Sender Avatar"
                        className="w-12 h-12 rounded-full mb-2"
                      />
                      <div className="text-sm font-semibold">
                        {senderUsername} : {scores[senderUserId] || 0} points
                      </div>
                    </div>
                    {invitationStatus === "Accepted" && (
                      <div className="flex flex-col items-center">
                        <img
                          src={receiverAvatarUrl}
                          alt="Receiver Avatar"
                          className="w-12 h-12 rounded-full mb-2"
                        />
                        <div className="text-sm font-semibold">
                          {receiverUsername} : {scores[receiverUserId] || 0}{" "}
                          points
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-2xl font-bold mb-6 flex justify-center">
                    {currentQuestion.question_text}
                  </div>
                  {currentQuestion.content && (
                    <div className="question-image">
                      {/* Display question content (image or video) here */}
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

                  {/* Display answer options */}
                  <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-4">
                    {shuffledOptions.map((option: any, index: number) => (
                      <li
                        key={index}
                        onClick={() => handleSelectAnswer(option)}
                        className={`bg-white m-2 rounded-lg border-2 border-b-4 border-r-4 border-black px-2 py-1 text-xl font-bold transition-all hover:-translate-y-[2px] md:block dark:border-white 
                            ${selectedAnswerIndex === index
                            ? "selected incorrect"
                            : ""
                          }
                          `}
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
                          width: `${timer === 10 ? "100%" : `${(timer - 1) * 11}%`
                            }`,
                        }}
                      ></div>
                    </div>
                  </div>
                </>
              ) : (
                <div>Ładowanie...</div>
              )}
            </div>
          </div>
        </div>
      );
    }
  };

  const renderResults = () => {
    return (
      <div className="flex justify-center mt-6">
        <Card className="flex flex-col mt-12 m-6 h-max lg:p-8 p-4 rounded-2xl border shadow-2xl border-gray-400">
          <CardHeader>
            <CardTitle>Quiz ukończony</CardTitle>
          </CardHeader>
          <CardHeader>
            <CardTitle>
              {winnerUsername !== null ? winnerUsername : "..."}{" "}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-black">
              Wynik {senderUsername}:
            </CardDescription>
            <CardDescription className="text-black">
              Poprawne odpowiedzi: {scores[senderUserId]}
            </CardDescription>
            <CardDescription className="text-black">
              Niepoprawne odpowiedzi: {5 - scores[senderUserId]}
            </CardDescription>
          </CardContent>

          <CardContent>
            <CardDescription className="text-black">
              Wynik {receiverUsername}:
            </CardDescription>
            <CardDescription className="text-black">
              Poprawne odpowiedzi: {scores[receiverUserId]}
            </CardDescription>
            <CardDescription className="text-black">
              Niepoprawne odpowiedzi: {5 - scores[receiverUserId]}
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

export default MultiplayerGame;
