import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export function CancelledBy({ userId }: { userId: string | null }) {
  const q = useQuery({ queryKey: ["members"], queryFn: async () => {
    const { data, error } = await supabase.from("business_members").select("user_id, display_name, email");
    if (error) throw error;
    return data;
  } });
  const member = q.data?.find((m) => m.user_id === userId);
  return <>{member?.display_name || member?.email || "User"}</>;
}