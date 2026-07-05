import { getSupabaseClient } from "../lib/supabase/client";

const DEFAULT_FOLLOW_UP_TYPES = [
  {
    id: "appointment",
    name: "Appointment",
    description: "Schedule a follow-up appointment",
    color: "#0d6efd",
  },
  {
    id: "repair",
    name: "Repair",
    description: "Follow-up repair work needed",
    color: "#fd7e14",
  },
  {
    id: "contract",
    name: "Contract",
    description: "Contract-related follow-up",
    color: "#198754",
  },
  {
    id: "verify",
    name: "Verify Customer",
    description: "Verify customer satisfaction",
    color: "#6f42c1",
  },
];

export const getDefaultFollowUpTypes = () => [...DEFAULT_FOLLOW_UP_TYPES];

export const fetchFollowUpTypes = async () => {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      console.warn(
        "Supabase client not available, using default follow-up types"
      );
      return getDefaultFollowUpTypes();
    }

    const { data: settings, error } = await supabase
      .from("settings")
      .select("*")
      .eq("id", "followUp")
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching follow-up types:", error);
      return getDefaultFollowUpTypes();
    }

    if (settings?.value?.types) {
      const types = settings.value.types;
      return Object.entries(types).map(([id, type]) => ({
        id,
        ...type,
      }));
    }

    return getDefaultFollowUpTypes();
  } catch (error) {
    console.error("Error fetching follow-up types:", error);
    return getDefaultFollowUpTypes();
  }
};

