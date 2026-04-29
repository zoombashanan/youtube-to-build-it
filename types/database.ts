export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_usage: {
        Row: {
          id: string;
          user_id: string;
          usage_date: string;
          count: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          usage_date: string;
          count?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          usage_date?: string;
          count?: number;
        };
        Relationships: [];
      };
      analytics: {
        Row: {
          id: string;
          event_type: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
