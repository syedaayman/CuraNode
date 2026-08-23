import { supabase } from "@/lib/supabase";
import { Hospital } from "@/app/page";

/**
 * Fetch all hospital listings from the Supabase database.
 */
export const fetchAllHospitals = async (): Promise<Hospital[]> => {
  const { data, error } = await supabase
    .from("hospitals")
    .select("*");

  if (error) {
    console.error("Supabase query error in hospitalService:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    throw new Error(`Supabase query failed: ${error.message} (Code: ${error.code}, Details: ${error.details}, Hint: ${error.hint})`);
  }

  return (data as Hospital[]) || [];
};
