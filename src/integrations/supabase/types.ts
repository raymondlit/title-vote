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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
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
      judges: {
        Row: {
          committee_role: Database["public"]["Enums"]["committee_role"]
          created_at: string
          full_name: string
          group_id: string | null
          id: string
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
          created_at: string
          id: string
          logo_url: string | null
          name: string
          short_name: string | null
          slug: string
          subtitle: string | null
        }
        Insert: {
          accent_color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          short_name?: string | null
          slug: string
          subtitle?: string | null
        }
        Update: {
          accent_color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          short_name?: string | null
          slug?: string
          subtitle?: string | null
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
      current_school_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_school_admin: { Args: { _school_id: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
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
    },
  },
} as const
