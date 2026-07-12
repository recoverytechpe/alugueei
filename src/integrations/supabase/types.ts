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
      _app_secrets: {
        Row: {
          name: string
          updated_at: string
          value: string
        }
        Insert: {
          name: string
          updated_at?: string
          value: string
        }
        Update: {
          name?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
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
      conversation_archives: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_archives_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
          {
            foreignKeyName: "conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
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
          {
            foreignKeyName: "favorites_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
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
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          read_at: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          id: string
          kind: string
          payer_id: string
          preference_id: string | null
          provider: string
          provider_payment_id: string | null
          raw: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          id?: string
          kind: string
          payer_id: string
          preference_id?: string | null
          provider?: string
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          id?: string
          kind?: string
          payer_id?: string
          preference_id?: string | null
          provider?: string
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rental_contracts"
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
          onboarded_at: string | null
          phone: string | null
          preferred_city: string | null
          privacy_accepted_at: string | null
          privacy_version: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          user_type: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          full_name: string
          id: string
          onboarded_at?: string | null
          phone?: string | null
          preferred_city?: string | null
          privacy_accepted_at?: string | null
          privacy_version?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_type?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          full_name?: string
          id?: string
          onboarded_at?: string | null
          phone?: string | null
          preferred_city?: string | null
          privacy_accepted_at?: string | null
          privacy_version?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_type?: string | null
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
          listed_by_agent_id: string | null
          neighborhood: string | null
          number: string
          owner_id: string
          parking_spots: number
          property_type: Database["public"]["Enums"]["property_type"]
          rent_value: number
          slug: string
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
          listed_by_agent_id?: string | null
          neighborhood?: string | null
          number: string
          owner_id: string
          parking_spots?: number
          property_type: Database["public"]["Enums"]["property_type"]
          rent_value: number
          slug?: string
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
          listed_by_agent_id?: string | null
          neighborhood?: string | null
          number?: string
          owner_id?: string
          parking_spots?: number
          property_type?: Database["public"]["Enums"]["property_type"]
          rent_value?: number
          slug?: string
          state?: string
          status?: Database["public"]["Enums"]["property_status"]
          street?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      property_affiliations: {
        Row: {
          agent_id: string
          approved_at: string | null
          can_edit_listing: boolean
          created_at: string
          expires_at: string | null
          id: string
          message: string | null
          owner_commission_pct: number
          property_id: string
          rejected_reason: string | null
          requested_at: string
          status: Database["public"]["Enums"]["affiliation_status"]
          tenant_commission_pct: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          approved_at?: string | null
          can_edit_listing?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          message?: string | null
          owner_commission_pct?: number
          property_id: string
          rejected_reason?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["affiliation_status"]
          tenant_commission_pct?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          approved_at?: string | null
          can_edit_listing?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          message?: string | null
          owner_commission_pct?: number
          property_id?: string
          rejected_reason?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["affiliation_status"]
          tenant_commission_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_affiliations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_affiliations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "property_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      property_unlocks: {
        Row: {
          amount_cents: number
          created_at: string
          expires_at: string | null
          id: string
          lgpd_accepted_at: string | null
          paid_at: string | null
          payment_id: string | null
          property_id: string
          status: string
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
          warning_sent_at: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          lgpd_accepted_at?: string | null
          paid_at?: string | null
          payment_id?: string | null
          property_id: string
          status?: string
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
          warning_sent_at?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          lgpd_accepted_at?: string | null
          paid_at?: string | null
          payment_id?: string | null
          property_id?: string
          status?: string
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
          warning_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_unlocks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_unlocks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_counters: {
        Row: {
          author_id: string
          created_at: string
          id: string
          message: string
          proposal_id: string
          rent_offer: number
          start_date: string
          status: string
          term_months: number
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          message?: string
          proposal_id: string
          rent_offer: number
          start_date: string
          status?: string
          term_months: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          message?: string
          proposal_id?: string
          rent_offer?: number
          start_date?: string
          status?: string
          term_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_counters_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
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
          tenant_preapproval_guarantee: string | null
          tenant_preapproval_income: number | null
          tenant_preapproval_max_rent: number | null
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
          tenant_preapproval_guarantee?: string | null
          tenant_preapproval_income?: number | null
          tenant_preapproval_max_rent?: number | null
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
          tenant_preapproval_guarantee?: string | null
          tenant_preapproval_income?: number | null
          tenant_preapproval_max_rent?: number | null
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
          {
            foreignKeyName: "proposals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
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
          agent_commission_marked_by: string | null
          agent_commission_paid_at: string | null
          agent_commission_pct: number
          agent_id: string | null
          contract_text: string
          created_at: string
          deposit_value: number | null
          id: string
          owner_id: string
          paid_at: string | null
          payment_id: string | null
          payment_status: string
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
          agent_commission_marked_by?: string | null
          agent_commission_paid_at?: string | null
          agent_commission_pct?: number
          agent_id?: string | null
          contract_text?: string
          created_at?: string
          deposit_value?: number | null
          id?: string
          owner_id: string
          paid_at?: string | null
          payment_id?: string | null
          payment_status?: string
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
          agent_commission_marked_by?: string | null
          agent_commission_paid_at?: string | null
          agent_commission_pct?: number
          agent_id?: string | null
          contract_text?: string
          created_at?: string
          deposit_value?: number | null
          id?: string
          owner_id?: string
          paid_at?: string | null
          payment_id?: string | null
          payment_status?: string
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
            foreignKeyName: "rental_contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
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
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_preapprovals: {
        Row: {
          cpf_doc_path: string | null
          created_at: string
          docs_uploaded_at: string | null
          guarantee_type: Database["public"]["Enums"]["guarantee_type"]
          id: string
          income_proof_path: string | null
          max_rent: number
          monthly_income: number
          preferred_city: string | null
          rg_doc_path: string | null
          share_as_lead: boolean
          status: Database["public"]["Enums"]["preapproval_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cpf_doc_path?: string | null
          created_at?: string
          docs_uploaded_at?: string | null
          guarantee_type: Database["public"]["Enums"]["guarantee_type"]
          id?: string
          income_proof_path?: string | null
          max_rent: number
          monthly_income: number
          preferred_city?: string | null
          rg_doc_path?: string | null
          share_as_lead?: boolean
          status?: Database["public"]["Enums"]["preapproval_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cpf_doc_path?: string | null
          created_at?: string
          docs_uploaded_at?: string | null
          guarantee_type?: Database["public"]["Enums"]["guarantee_type"]
          id?: string
          income_proof_path?: string | null
          max_rent?: number
          monthly_income?: number
          preferred_city?: string | null
          rg_doc_path?: string | null
          share_as_lead?: boolean
          status?: Database["public"]["Enums"]["preapproval_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tenant_ratings: {
        Row: {
          comment: string
          contract_id: string
          created_at: string
          id: string
          rater_id: string
          stars: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          comment?: string
          contract_id: string
          created_at?: string
          id?: string
          rater_id: string
          stars: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          comment?: string
          contract_id?: string
          created_at?: string
          id?: string
          rater_id?: string
          stars?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ratings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "rental_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
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
          {
            foreignKeyName: "visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
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
      properties_public: {
        Row: {
          area_m2: number | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          condo_value: number | null
          created_at: string | null
          description: string | null
          id: string | null
          iptu_value: number | null
          neighborhood: string | null
          parking_spots: number | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          rent_value: number | null
          slug: string | null
          state: string | null
          title: string | null
        }
        Insert: {
          area_m2?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          condo_value?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          iptu_value?: number | null
          neighborhood?: string | null
          parking_spots?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          rent_value?: number | null
          slug?: string | null
          state?: string | null
          title?: string | null
        }
        Update: {
          area_m2?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          condo_value?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          iptu_value?: number | null
          neighborhood?: string | null
          parking_spots?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          rent_value?: number | null
          slug?: string | null
          state?: string | null
          title?: string | null
        }
        Relationships: []
      }
      property_photos_public: {
        Row: {
          id: string | null
          position: number | null
          property_id: string | null
          storage_path: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      agent_signal_interest: { Args: { _lead_id: string }; Returns: undefined }
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
      get_property_interest_counts: {
        Args: { _property_ids: string[] }
        Returns: {
          interested_count: number
          property_id: string
        }[]
      }
      get_public_agent_profile: { Args: { _agent_id: string }; Returns: Json }
      get_push_dispatch_secret: { Args: never; Returns: string }
      get_tenant_rating: {
        Args: { _tenant_id: string }
        Returns: {
          avg_stars: number
          total_ratings: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_unlock: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      is_property_owner: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      list_preapproval_leads: {
        Args: { _city?: string }
        Returns: {
          city: string
          created_at: string
          guarantee_type: string
          id: string
          income_bucket: string
          initials: string
        }[]
      }
      mark_agent_commission_paid: {
        Args: { _contract_id: string }
        Returns: {
          agent_commission_marked_by: string | null
          agent_commission_paid_at: string | null
          agent_commission_pct: number
          agent_id: string | null
          contract_text: string
          created_at: string
          deposit_value: number | null
          id: string
          owner_id: string
          paid_at: string | null
          payment_id: string | null
          payment_status: string
          property_id: string
          proposal_id: string | null
          rent_value: number | null
          start_date: string | null
          status: string
          tenant_id: string
          term_months: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "rental_contracts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      notify_user: {
        Args: {
          _body: string
          _kind: string
          _title: string
          _url: string
          _user_id: string
        }
        Returns: undefined
      }
      slugify: { Args: { input: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      affiliation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "revoked"
        | "expired"
        | "completed"
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
      affiliation_status: [
        "pending",
        "approved",
        "rejected",
        "revoked",
        "expired",
        "completed",
      ],
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
