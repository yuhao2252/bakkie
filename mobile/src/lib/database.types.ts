export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bags: {
        Row: {
          attributes: Json
          coffee_id: string
          created_at: string
          currency: string | null
          degas_days_to_peak: number | null
          id: string
          initial_grams: number
          notes: string | null
          opened_at: string | null
          peak_window_days: number
          price: number | null
          purchased_at: string | null
          roast_date: string | null
          status: Database["public"]["Enums"]["bag_status"]
          updated_at: string
          user_id: string
          vendor: string | null
        }
        Insert: {
          attributes?: Json
          coffee_id: string
          created_at?: string
          currency?: string | null
          degas_days_to_peak?: number | null
          id?: string
          initial_grams: number
          notes?: string | null
          opened_at?: string | null
          peak_window_days?: number
          price?: number | null
          purchased_at?: string | null
          roast_date?: string | null
          status?: Database["public"]["Enums"]["bag_status"]
          updated_at?: string
          user_id: string
          vendor?: string | null
        }
        Update: {
          attributes?: Json
          coffee_id?: string
          created_at?: string
          currency?: string | null
          degas_days_to_peak?: number | null
          id?: string
          initial_grams?: number
          notes?: string | null
          opened_at?: string | null
          peak_window_days?: number
          price?: number | null
          purchased_at?: string | null
          roast_date?: string | null
          status?: Database["public"]["Enums"]["bag_status"]
          updated_at?: string
          user_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bags_coffee_fkey"
            columns: ["coffee_id", "user_id"]
            isOneToOne: false
            referencedRelation: "coffees"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      brew_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_espresso: boolean
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_espresso?: boolean
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_espresso?: boolean
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      brew_ratings: {
        Row: {
          brew_id: string
          created_at: string
          criterion_id: string
          score: number
          user_id: string
        }
        Insert: {
          brew_id: string
          created_at?: string
          criterion_id: string
          score: number
          user_id: string
        }
        Update: {
          brew_id?: string
          created_at?: string
          criterion_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brew_ratings_brew_fkey"
            columns: ["brew_id", "user_id"]
            isOneToOne: false
            referencedRelation: "brews"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "brew_ratings_criterion_fkey"
            columns: ["criterion_id", "user_id"]
            isOneToOne: false
            referencedRelation: "rating_criteria"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      brews: {
        Row: {
          attributes: Json
          bag_id: string
          brew_method_id: string | null
          brew_time_seconds: number | null
          brewed_at: string
          created_at: string
          dose_grams: number
          grind_setting: string | null
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          water_grams: number | null
          water_temp_c: number | null
          yield_grams: number | null
        }
        Insert: {
          attributes?: Json
          bag_id: string
          brew_method_id?: string | null
          brew_time_seconds?: number | null
          brewed_at?: string
          created_at?: string
          dose_grams: number
          grind_setting?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          water_grams?: number | null
          water_temp_c?: number | null
          yield_grams?: number | null
        }
        Update: {
          attributes?: Json
          bag_id?: string
          brew_method_id?: string | null
          brew_time_seconds?: number | null
          brewed_at?: string
          created_at?: string
          dose_grams?: number
          grind_setting?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          water_grams?: number | null
          water_temp_c?: number | null
          yield_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brews_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "bags"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "brews_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_freshness"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "brews_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_overview"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "brews_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_stock"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "brews_brew_method_fkey"
            columns: ["brew_method_id", "user_id"]
            isOneToOne: false
            referencedRelation: "brew_methods"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      coffee_varieties: {
        Row: {
          coffee_id: string
          created_at: string
          percentage: number | null
          user_id: string
          variety_id: string
        }
        Insert: {
          coffee_id: string
          created_at?: string
          percentage?: number | null
          user_id: string
          variety_id: string
        }
        Update: {
          coffee_id?: string
          created_at?: string
          percentage?: number | null
          user_id?: string
          variety_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coffee_varieties_coffee_fkey"
            columns: ["coffee_id", "user_id"]
            isOneToOne: false
            referencedRelation: "coffees"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "coffee_varieties_variety_fkey"
            columns: ["variety_id", "user_id"]
            isOneToOne: false
            referencedRelation: "varieties"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      coffees: {
        Row: {
          altitude_masl: number | null
          attributes: Json
          country: string | null
          created_at: string
          description: string | null
          id: string
          is_decaf: boolean
          name: string
          process_id: string | null
          producer: string | null
          region: string | null
          roast_level: Database["public"]["Enums"]["roast_level"] | null
          roaster_id: string | null
          source_url: string | null
          tasting_notes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          altitude_masl?: number | null
          attributes?: Json
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_decaf?: boolean
          name: string
          process_id?: string | null
          producer?: string | null
          region?: string | null
          roast_level?: Database["public"]["Enums"]["roast_level"] | null
          roaster_id?: string | null
          source_url?: string | null
          tasting_notes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          altitude_masl?: number | null
          attributes?: Json
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_decaf?: boolean
          name?: string
          process_id?: string | null
          producer?: string | null
          region?: string | null
          roast_level?: Database["public"]["Enums"]["roast_level"] | null
          roaster_id?: string | null
          source_url?: string | null
          tasting_notes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coffees_process_fkey"
            columns: ["process_id", "user_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "coffees_roaster_fkey"
            columns: ["roaster_id", "user_id"]
            isOneToOne: false
            referencedRelation: "roasters"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      import_job_photos: {
        Row: {
          created_at: string
          id: string
          import_job_id: string
          position: number
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_job_id: string
          position?: number
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          import_job_id?: string
          position?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_job_photos_import_job_id_user_id_fkey"
            columns: ["import_job_id", "user_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          confidence: number | null
          created_at: string
          created_bag_id: string | null
          created_coffee_id: string | null
          error_message: string | null
          extracted: Json | null
          id: string
          processed_at: string | null
          raw_payload: Json | null
          source: Database["public"]["Enums"]["import_source"]
          source_url: string | null
          status: Database["public"]["Enums"]["import_status"]
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_bag_id?: string | null
          created_coffee_id?: string | null
          error_message?: string | null
          extracted?: Json | null
          id?: string
          processed_at?: string | null
          raw_payload?: Json | null
          source: Database["public"]["Enums"]["import_source"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_bag_id?: string | null
          created_coffee_id?: string | null
          error_message?: string | null
          extracted?: Json | null
          id?: string
          processed_at?: string | null
          raw_payload?: Json | null
          source?: Database["public"]["Enums"]["import_source"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_created_bag_fkey"
            columns: ["created_bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "bags"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "import_jobs_created_bag_fkey"
            columns: ["created_bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_freshness"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "import_jobs_created_bag_fkey"
            columns: ["created_bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_overview"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "import_jobs_created_bag_fkey"
            columns: ["created_bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_stock"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "import_jobs_created_coffee_fkey"
            columns: ["created_coffee_id", "user_id"]
            isOneToOne: false
            referencedRelation: "coffees"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          bag_id: string
          brew_id: string | null
          created_at: string
          grams_delta: number
          id: string
          note: string | null
          occurred_at: string
          txn_type: Database["public"]["Enums"]["inventory_txn_type"]
          user_id: string
        }
        Insert: {
          bag_id: string
          brew_id?: string | null
          created_at?: string
          grams_delta: number
          id?: string
          note?: string | null
          occurred_at?: string
          txn_type: Database["public"]["Enums"]["inventory_txn_type"]
          user_id: string
        }
        Update: {
          bag_id?: string
          brew_id?: string | null
          created_at?: string
          grams_delta?: number
          id?: string
          note?: string | null
          occurred_at?: string
          txn_type?: Database["public"]["Enums"]["inventory_txn_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "bags"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "inventory_transactions_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_freshness"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "inventory_transactions_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_overview"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "inventory_transactions_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_stock"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "inventory_transactions_brew_fkey"
            columns: ["brew_id", "user_id"]
            isOneToOne: false
            referencedRelation: "brews"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      photos: {
        Row: {
          bag_id: string | null
          caption: string | null
          coffee_id: string | null
          created_at: string
          id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          bag_id?: string | null
          caption?: string | null
          coffee_id?: string | null
          created_at?: string
          id?: string
          storage_path: string
          user_id: string
        }
        Update: {
          bag_id?: string | null
          caption?: string | null
          coffee_id?: string | null
          created_at?: string
          id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "bags"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "photos_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_freshness"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "photos_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_overview"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "photos_bag_fkey"
            columns: ["bag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "v_bag_stock"
            referencedColumns: ["bag_id", "user_id"]
          },
          {
            foreignKeyName: "photos_coffee_fkey"
            columns: ["coffee_id", "user_id"]
            isOneToOne: false
            referencedRelation: "coffees"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      processes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          default_currency: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rating_criteria: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          scale_max: number
          scale_min: number
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          scale_max?: number
          scale_min?: number
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          scale_max?: number
          scale_min?: number
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      roasters: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      varieties: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_bag_freshness: {
        Row: {
          bag_id: string | null
          days_since_roast: number | null
          freshness_state: string | null
          peak_ends_on: string | null
          peak_starts_on: string | null
          roast_date: string | null
          user_id: string | null
        }
        Insert: {
          bag_id?: string | null
          days_since_roast?: never
          freshness_state?: never
          peak_ends_on?: never
          peak_starts_on?: never
          roast_date?: string | null
          user_id?: string | null
        }
        Update: {
          bag_id?: string | null
          days_since_roast?: never
          freshness_state?: never
          peak_ends_on?: never
          peak_starts_on?: never
          roast_date?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_bag_overview: {
        Row: {
          bag_id: string | null
          brew_count: number | null
          coffee_id: string | null
          coffee_name: string | null
          composition: Json | null
          country: string | null
          currency: string | null
          days_since_roast: number | null
          freshness_state: string | null
          grams_remaining: number | null
          is_blend: boolean | null
          last_brewed_at: string | null
          percent_remaining: number | null
          price: number | null
          price_per_gram: number | null
          roast_date: string | null
          roast_level: Database["public"]["Enums"]["roast_level"] | null
          roaster_name: string | null
          status: Database["public"]["Enums"]["bag_status"] | null
          tasting_notes: string[] | null
          user_id: string | null
          variety_names: string[] | null
        }
        Relationships: []
      }
      v_bag_stock: {
        Row: {
          bag_id: string | null
          brew_count: number | null
          coffee_id: string | null
          grams_remaining: number | null
          initial_grams: number | null
          last_brewed_at: string | null
          percent_remaining: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bags_coffee_fkey"
            columns: ["coffee_id", "user_id"]
            isOneToOne: false
            referencedRelation: "coffees"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      v_coffee_varieties: {
        Row: {
          coffee_id: string | null
          composition: Json | null
          is_blend: boolean | null
          user_id: string | null
          variety_names: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "coffee_varieties_coffee_fkey"
            columns: ["coffee_id", "user_id"]
            isOneToOne: false
            referencedRelation: "coffees"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Functions: {
      confirm_import: {
        Args: { p_job_id: string; p_reviewed: Json }
        Returns: Json
      }
    }
    Enums: {
      bag_status: "sealed" | "open" | "finished" | "discarded"
      import_source: "url" | "photo" | "manual"
      import_status:
        | "pending"
        | "extracting"
        | "extracted"
        | "failed"
        | "confirmed"
        | "rejected"
      inventory_txn_type: "purchase" | "brew" | "waste" | "gift" | "adjustment"
      roast_level: "light" | "medium_light" | "medium" | "medium_dark" | "dark"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      bag_status: ["sealed", "open", "finished", "discarded"],
      import_source: ["url", "photo", "manual"],
      import_status: [
        "pending",
        "extracting",
        "extracted",
        "failed",
        "confirmed",
        "rejected",
      ],
      inventory_txn_type: ["purchase", "brew", "waste", "gift", "adjustment"],
      roast_level: ["light", "medium_light", "medium", "medium_dark", "dark"],
    },
  },
} as const

