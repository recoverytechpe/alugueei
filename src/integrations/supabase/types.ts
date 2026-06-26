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
      agent_ratings: {
        Row: {
          agent_id: string
          comment: string
          contract_id: string
          created_at: string
          id: string
          rater_id: string
          stars: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          comment?: string
          contract_id: string
          created_at?: string
          id?: string
          rater_id: string
          stars: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          comment?: string
          contract_id?: string
          created_at?: string
          id?: string
          rater_id?: string
          stars?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_ratings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rental_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          contract_id: string
          id: string
          signature_text: string
          signed_at: string
          signer_id: string
          signer_role: string
        }
        Insert: {
          contract_id: string
          id?: string
          signature_text: string
          signed_at?: string
          signer_id: string
          signer_role: string
        }
        Update: {
          contract_id?: string
          id?: string
          signature_text?: string
          signed_at?: string
          signer_id?: string
          signer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rental_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          contacts_unlocked: boolean
          created_at: string
          id: string
          initiator_id: string
          last_message_at: string | null
          property_id: string
          recipient_id: string
          updated_at: string
        }
        Insert: {
          contacts_unlocked?: boolean
          created_at?: string
          id?: string
          initiator_id: string
          last_message_at?: string | null
          property_id: string
          recipient_id: string
          updated_at?: string
        }
        Update: {
          contacts_unlocked?: boolean
          created_at?: string
          id?: string
          initiator_id?: string
          last_message_at?: string | null
          property_id?: string
          recipient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_alerts: {
        Row: {
          conversation_id: string | null
          created_at: string
          excerpt: string
          id: string
          message_id: string | null
          reason: string
          sender_id: string
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          excerpt: string
          id?: string
          message_id?: string | null
          reason: string
          sender_id: string
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          message_id?: string | null
          reason?: string
          sender_id?: string
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_alerts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_alerts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          cpf_cnpj: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          area_m2: number
          bathrooms: number
          bedrooms: number
          cep: string
          city: string
          complement: string | null
          condo_value: number
          created_at: string
          description: string
          id: string
          iptu_value: number
          neighborhood: string | null
          number: string
          owner_id: string
          parking_spots: number
          property_type: Database["public"]["Enums"]["property_type"]
          rent_value: number
          state: string
          status: Database["public"]["Enums"]["property_status"]
          street: string
          title: string
          updated_at: string
        }
        Insert: {
          area_m2?: number
          bathrooms?: number
          bedrooms?: number
          cep: string
          city: string
          complement?: string | null
          condo_value?: number
          created_at?: string
          description?: string
          id?: string
          iptu_value?: number
          neighborhood?: string | null
          number: string
          owner_id: string
          parking_spots?: number
          property_type: Database["public"]["Enums"]["property_type"]
          rent_value: number
          state: string
          status?: Database["public"]["Enums"]["property_status"]
          street: string
          title: string
          updated_at?: string
        }
        Update: {
          area_m2?: number
          bathrooms?: number
          bedrooms?: number
          cep?: string
          city?: string
          complement?: string | null
          condo_value?: number
          created_at?: string
          description?: string
          id?: string
          iptu_value?: number
          neighborhood?: string | null
          number?: string
          owner_id?: string
          parking_spots?: number
          property_type?: Database["public"]["Enums"]["property_type"]
          rent_value?: number
          state?: string
          status?: Database["public"]["Enums"]["property_status"]
          street?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      property_photos: {
        Row: {
          created_at: string
          id: string
          position: number
          property_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          property_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          property_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          message: string
          owner_id: string
          property_id: string
          rent_offer: number
          start_date: string
          status: string
          tenant_id: string
          term_months: number
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          message?: string
          owner_id: string
          property_id: string
          rent_offer: number
          start_date: string
          status?: string
          tenant_id: string
          term_months?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          message?: string
          owner_id?: string
          property_id?: string
          rent_offer?: number
          start_date?: string
          status?: string
          tenant_id?: string
          term_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rental_contracts: {
        Row: {
          agent_id: string | null
          contract_text: string
          created_at: string
          id: string
          owner_id: string
          property_id: string
          proposal_id: string | null
          rent_value: number | null
          start_date: string | null
          status: string
          tenant_id: string
          term_months: number | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          contract_text?: string
          created_at?: string
          id?: string
          owner_id: string
          property_id: string
          proposal_id?: string | null
          rent_value?: number | null
          start_date?: string | null
          status?: string
          tenant_id: string
          term_months?: number | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          contract_text?: string
          created_at?: string
          id?: string
          owner_id?: string
          property_id?: string
          proposal_id?: string | null
          rent_value?: number | null
          start_date?: string | null
          status?: string
          tenant_id?: string
          term_months?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_preapprovals: {
        Row: {
          created_at: string
          guarantee_type: Database["public"]["Enums"]["guarantee_type"]
          id: string
          max_rent: number
          monthly_income: number
          status: Database["public"]["Enums"]["preapproval_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          guarantee_type: Database["public"]["Enums"]["guarantee_type"]
          id?: string
          max_rent: number
          monthly_income: number
          status?: Database["public"]["Enums"]["preapproval_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          guarantee_type?: Database["public"]["Enums"]["guarantee_type"]
          id?: string
          max_rent?: number
          monthly_income?: number
          status?: Database["public"]["Enums"]["preapproval_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          notes: string | null
          owner_id: string
          property_id: string
          scheduled_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner_id: string
          property_id: string
          scheduled_at: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string
          property_id?: string
          scheduled_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      dispatch_push: {
        Args: { _body: string; _title: string; _url: string; _user_id: string }
        Returns: undefined
      }
      get_agent_rating: {
        Args: { _agent_id: string }
        Returns: {
          avg_stars: number
          total_ratings: number
        }[]
      }
      get_agent_visibility: {
        Args: { _agent_id: string }
        Returns: {
          avg_stars: number
          closed_deals: number
          total_ratings: number
          visibility_score: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "proprietario" | "locatario" | "agente" | "admin"
      guarantee_type:
        | "fiador"
        | "seguro_fianca"
        | "caucao"
        | "titulo_capitalizacao"
      preapproval_status: "pending" | "approved" | "rejected"
      property_status: "available" | "rented" | "inactive"
      property_type: "casa" | "apartamento"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["proprietario", "locatario", "agente", "admin"],
      guarantee_type: [
        "fiador",
        "seguro_fianca",
        "caucao",
        "titulo_capitalizacao",
      ],
      preapproval_status: ["pending", "approved", "rejected"],
      property_status: ["available", "rented", "inactive"],
      property_type: ["casa", "apartamento"],
    },
  },
} as const
