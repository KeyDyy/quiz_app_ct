// W osobnym module np. api.ts
import { supabase } from "@/lib/supabase";

export async function getQuizzesData() {
  const { data, error } = await supabase.from("quizzes").select("logo, title, description");
  if (error) {
    throw new Error("Błąd pobierania danych");
  }
  return data || [];
}
