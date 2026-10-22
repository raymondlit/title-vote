export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_credentials: {
        Row: {
          current_password: string
          updated_at: string
          user_id: string
        }
        Insert: {
          current_password: string
          updated_at?: string
          user_id: string
        }
        Update: {
          current_password?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          id: string
          permission: Database["public"]["Enums"]["admin_permission"]
          user_id: string
        }
        Insert: {
          id?: string
          permission: Database["public"]["Enums"]["admin_permission"]
          user_id: string
        }
        Update: {
          id?: string
          permission?: Database["public"]["Enums"]["admin_permission"]
          user_id?: string
        }
        Relationships: []
      }
      ballot_items: {
        Row: {
          ballot_id: string
          candidate_id: string
          choice: Database["public"]["Enums"]["vote_choice"]
          created_at: string
          id: string
        }
        Insert: {
          ballot_id: string
          candidate_id: string
          choice: Database["public"]["Enums"]["vote_choice"]
          created_at?: string
          id?: string
        }
        Update: {
          ballot_id?: string
          candidate_id?: string
          choice?: Database["public"]["Enums"]["vote_choice"]
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ballot_items_ballot_id_fkey"
            columns: ["ballot_id"]
            isOneToOne: false
            referencedRelation: "ballots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ballot_items_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      ballots: {
        Row: {
          created_at: string
          id: string
          judge_id: string
          session_id: string
          submitted_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          judge_id: string
          session_id: string
          submitted_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          judge_id?: string
          session_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ballots_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "judges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ballots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "vote_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          category_id: string | null
          created_at: string
          current_title: string | null
          full_name: string
          group_id: string | null
          id: string
          notes: string | null
          school_id: string
          unit: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          current_title?: string | null
          full_name: string
          group_id?: string | null
          id?: string
          notes?: string | null
          school_id: string
          unit?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          current_title?: string | null
          full_name?: string
          group_id?: string | null
          id?: string
          notes?: string | null
          school_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "review_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "subject_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_credentials: {
        Row: {
          current_password: string
          judge_id: string
          updated_at: string
        }
        Insert: {
          current_password: string
          judge_id: string
          updated_at?: string
        }
        Update: {
          current_password?: string
          judge_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_credentials_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: true
            referencedRelation: "judges"
            referencedColumns: ["id"]
          },
        ]
      }
      judges: {
        Row: {
          committee_role: Database["public"]["Enums"]["committee_role"]
          created_at: string
          full_name: string
          group_id: string | null
          id: string
          is_committee_member: boolean
          is_group_leader: boolean
          phone: string | null
          profile_id: string | null
          school_id: string
          staff_no: string | null
          title: string | null
          unit: string | null
          username: string | null
        }
        Insert: {
          committee_role?: Database["public"]["Enums"]["committee_role"]
          created_at?: string
          full_name: string
          group_id?: string | null
          id?: string
          is_committee_member?: boolean
          is_group_leader?: boolean
          phone?: string | null
          profile_id?: string | null
          school_id: string
          staff_no?: string | null
          title?: string | null
          unit?: string | null
          username?: string | null
        }
        Update: {
          committee_role?: Database["public"]["Enums"]["committee_role"]
          created_at?: string
          full_name?: string
          group_id?: string | null
          id?: string
          is_committee_member?: boolean
          is_group_leader?: boolean
          phone?: string | null
          profile_id?: string | null
          school_id?: string
          staff_no?: string | null
          title?: string | null
          unit?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judges_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "subject_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judges_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_group_result_batches: {
        Row: {
          category_id: string | null
          created_at: string
          group_id: string | null
          id: string
          recommended_count: number
          recorded_by: string | null
          row_count: number
          school_id: string
          snapshot: Json
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          recommended_count?: number
          recorded_by?: string | null
          row_count?: number
          school_id: string
          snapshot?: Json
        }
        Update: {
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          recommended_count?: number
          recorded_by?: string | null
          row_count?: number
          school_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "offline_group_result_batches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "review_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_group_result_batches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "subject_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_group_result_batches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_group_results: {
        Row: {
          agree_votes: number
          candidate_id: string
          category_id: string | null
          created_at: string
          group_id: string | null
          id: string
          is_recommended: boolean
          recorded_by: string | null
          school_id: string
          total_votes: number
        }
        Insert: {
          agree_votes?: number
          candidate_id: string
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_recommended?: boolean
          recorded_by?: string | null
          school_id: string
          total_votes?: number
        }
        Update: {
          agree_votes?: number
          candidate_id?: string
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_recommended?: boolean
          recorded_by?: string | null
          school_id?: string
          total_votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "offline_group_results_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_group_results_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "review_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_group_results_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "subject_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_group_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          school_id: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          school_id?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          school_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      review_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          school_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          accent_color: string
          allow_judge_password_change: boolean
          color_scheme: string
          created_at: string
          display_mode: string
          font_family: string
          font_scale: string
          id: string
          judge_password_charset: string
          judge_password_length: number
          layout_density: string
          logo_url: string | null
          name: string
          result_sheet_config: Json
          short_name: string | null
          slug: string
          subtitle: string | null
          vote_label_not_recommend: string
          vote_label_recommend: string
        }
        Insert: {
          accent_color?: string
          allow_judge_password_change?: boolean
          color_scheme?: string
          created_at?: string
          display_mode?: string
          font_family?: string
          font_scale?: string
          id?: string
          judge_password_charset?: string
          judge_password_length?: number
          layout_density?: string
          logo_url?: string | null
          name: string
          result_sheet_config?: Json
          short_name?: string | null
          slug: string
          subtitle?: string | null
          vote_label_not_recommend?: string
          vote_label_recommend?: string
        }
        Update: {
          accent_color?: string
          allow_judge_password_change?: boolean
          color_scheme?: string
          created_at?: string
          display_mode?: string
          font_family?: string
          font_scale?: string
          id?: string
          judge_password_charset?: string
          judge_password_length?: number
          layout_density?: string
          logo_url?: string | null
          name?: string
          result_sheet_config?: Json
          short_name?: string | null
          slug?: string
          subtitle?: string | null
          vote_label_not_recommend?: string
          vote_label_recommend?: string
        }
        Relationships: []
      }
      subject_groups: {
        Row: {
          created_at: string
          id: string
          leader_mode: string
          name: string
          school_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          leader_mode?: string
          name: string
          school_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          leader_mode?: string
          name?: string
          school_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "subject_groups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vote_archives: {
        Row: {
          archived_by: string | null
          category_id: string | null
          created_at: string
          group_id: string | null
          id: string
          school_id: string
          session_id: string | null
          snapshot: Json
          title: string
        }
        Insert: {
          archived_by?: string | null
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          school_id: string
          session_id?: string | null
          snapshot?: Json
          title: string
        }
        Update: {
          archived_by?: string | null
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          school_id?: string
          session_id?: string | null
          snapshot?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_archives_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "review_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_archives_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "subject_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_archives_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_sessions: {
        Row: {
          candidate_ids: string[] | null
          category_id: string | null
          closed_at: string | null
          created_at: string
          group_id: string | null
          id: string
          max_recommend: number | null
          opened_at: string | null
          parent_session_id: string | null
          passed_candidate_ids: string[] | null
          round_number: number
          school_id: string
          status: string
          title: string
          updated_at: string
          voter_scope: string
        }
        Insert: {
          candidate_ids?: string[] | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          max_recommend?: number | null
          opened_at?: string | null
          parent_session_id?: string | null
          passed_candidate_ids?: string[] | null
          round_number?: number
          school_id: string
          status?: string
          title: string
          updated_at?: string
          voter_scope?: string
        }
        Update: {
          candidate_ids?: string[] | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          max_recommend?: number | null
          opened_at?: string | null
          parent_session_id?: string | null
          passed_candidate_ids?: string[] | null
          round_number?: number
          school_id?: string
          status?: string
          title?: string
          updated_at?: string
          voter_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_sessions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "review_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "subject_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_sessions_parent_session_id_fkey"
            columns: ["parent_session_id"]
            isOneToOne: false
            referencedRelation: "vote_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      voting_rules: {
        Row: {
          allow_abstain: boolean
          category_id: string | null
          created_at: string
          group_id: string | null
          id: string
          max_recommend: number
          require_all: boolean
          school_id: string
          total_count: number
        }
        Insert: {
          allow_abstain?: boolean
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          max_recommend?: number
          require_all?: boolean
          school_id: string
          total_count?: number
        }
        Update: {
          allow_abstain?: boolean
          category_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          max_recommend?: number
          require_all?: boolean
          school_id?: string
          total_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "voting_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "review_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voting_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "subject_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voting_rules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_dashboard_stats: { Args: { _school_id: string }; Returns: Json }
      ballot_is_mine: { Args: { _ballot_id: string }; Returns: boolean }
      ballot_school_id: { Args: { _ballot_id: string }; Returns: string }
      candidate_school_id: { Args: { _candidate_id: string }; Returns: string }
      current_school_id: { Args: never; Returns: string }
      get_school_branding: {
        Args: { _slug: string }
        Returns: {
          accent_color: string
          color_scheme: string
          display_mode: string
          font_family: string
          font_scale: string
          layout_density: string
          logo_url: string
          name: string
          subtitle: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_my_judge: { Args: { _judge_id: string }; Returns: boolean }
      is_school_admin: { Args: { _school_id: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      judge_school_id: { Args: { _judge_id: string }; Returns: string }
      session_is_open: { Args: { _session_id: string }; Returns: boolean }
      session_school_id: { Args: { _session_id: string }; Returns: string }
    }
    Enums: {
      admin_permission:
        | "branding"
        | "judges"
        | "candidates"
        | "groups_rules"
        | "results"
      app_role: "superadmin" | "admin" | "judge"
      committee_role: "chair" | "vice_chair" | "member"
      vote_choice: "recommend" | "not_recommend" | "abstain"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_permission: [
        "branding",
        "judges",
        "candidates",
        "groups_rules",
        "results",
      ],
      app_role: ["superadmin", "admin", "judge"],
      committee_role: ["chair", "vice_chair", "member"],
      vote_choice: ["recommend", "not_recommend", "abstain"],
    },
  },
} as const
