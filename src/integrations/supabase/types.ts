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
      account_devices: {
        Row: {
          created_at: string
          fingerprint: string | null
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprint?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprint?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_cost_log: {
        Row: {
          completion_tokens: number
          cost_usd: number
          created_at: string
          id: string
          model: string
          plan_id: string | null
          prompt_tokens: number
          stage: string
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          model: string
          plan_id?: string | null
          prompt_tokens?: number
          stage: string
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          model?: string
          plan_id?: string | null
          prompt_tokens?: number
          stage?: string
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      alert_preferences: {
        Row: {
          alerts_enabled: boolean
          browser_enabled: boolean
          email_directions: string[]
          email_enabled: boolean
          email_grades: string[]
          email_pairs: string[]
          min_grade: string
          quiet_end: string | null
          quiet_start: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alerts_enabled?: boolean
          browser_enabled?: boolean
          email_directions?: string[]
          email_enabled?: boolean
          email_grades?: string[]
          email_pairs?: string[]
          min_grade?: string
          quiet_end?: string | null
          quiet_start?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alerts_enabled?: boolean
          browser_enabled?: boolean
          email_directions?: string[]
          email_enabled?: boolean
          email_grades?: string[]
          email_pairs?: string[]
          min_grade?: string
          quiet_end?: string | null
          quiet_start?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auto_scan_pool_ledger: {
        Row: {
          ai_cost_usd: number | null
          alert_id: string | null
          broadcast_count: number
          confidence: number
          cost_usd: number
          created_at: string
          direction: string
          id: string
          pair: string
        }
        Insert: {
          ai_cost_usd?: number | null
          alert_id?: string | null
          broadcast_count?: number
          confidence: number
          cost_usd?: number
          created_at?: string
          direction: string
          id?: string
          pair: string
        }
        Update: {
          ai_cost_usd?: number | null
          alert_id?: string | null
          broadcast_count?: number
          confidence?: number
          cost_usd?: number
          created_at?: string
          direction?: string
          id?: string
          pair?: string
        }
        Relationships: []
      }
      auto_scan_runs: {
        Row: {
          broadcast_alert_id: string | null
          broadcast_pair: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          mode: string
          pairs_checked: string[]
          results: Json
          skip_reason: string | null
          started_at: string
        }
        Insert: {
          broadcast_alert_id?: string | null
          broadcast_pair?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          pairs_checked?: string[]
          results?: Json
          skip_reason?: string | null
          started_at?: string
        }
        Update: {
          broadcast_alert_id?: string | null
          broadcast_pair?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          pairs_checked?: string[]
          results?: Json
          skip_reason?: string | null
          started_at?: string
        }
        Relationships: []
      }
      auto_scan_state: {
        Row: {
          direction: string
          first_conf: number
          first_seen_at: string
          last_broadcast_at: string | null
          pair: string
          updated_at: string
        }
        Insert: {
          direction: string
          first_conf: number
          first_seen_at?: string
          last_broadcast_at?: string | null
          pair: string
          updated_at?: string
        }
        Update: {
          direction?: string
          first_conf?: number
          first_seen_at?: string
          last_broadcast_at?: string | null
          pair?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          guest_email: string | null
          guest_name: string | null
          id: string
          last_message_at: string
          session_token: string
          status: string
          unread_admin: number
          unread_guest: number
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          last_message_at?: string
          session_token?: string
          status?: string
          unread_admin?: number
          unread_guest?: number
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          last_message_at?: string
          session_token?: string
          status?: string
          unread_admin?: number
          unread_guest?: number
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      community_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      community_bookmarks: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: []
      }
      community_impressions: {
        Row: {
          first_seen_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          first_seen_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          first_seen_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_impressions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          attached_signal_id: string | null
          author_id: string
          body: string
          bookmark_count: number
          cashtags: string[]
          created_at: string
          deleted_at: string | null
          id: string
          like_count: number
          media_urls: string[]
          parent_post_id: string | null
          reply_count: number
          repost_count: number
          updated_at: string
          view_count: number
        }
        Insert: {
          attached_signal_id?: string | null
          author_id: string
          body: string
          bookmark_count?: number
          cashtags?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          like_count?: number
          media_urls?: string[]
          parent_post_id?: string | null
          reply_count?: number
          repost_count?: number
          updated_at?: string
          view_count?: number
        }
        Update: {
          attached_signal_id?: string | null
          author_id?: string
          body?: string
          bookmark_count?: number
          cashtags?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          like_count?: number
          media_urls?: string[]
          parent_post_id?: string | null
          reply_count?: number
          repost_count?: number
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_parent_post_id_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_profiles: {
        Row: {
          bio: string | null
          cover_url: string | null
          created_at: string
          display_name: string | null
          handle: string
          handle_locked_at: string
          location: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          display_name?: string | null
          handle: string
          handle_locked_at?: string
          location?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string
          handle_locked_at?: string
          location?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      community_reports: {
        Row: {
          created_at: string
          id: string
          post_id: string | null
          profile_id: string | null
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolver_id: string | null
          status: Database["public"]["Enums"]["community_report_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id?: string | null
          profile_id?: string | null
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolver_id?: string | null
          status?: Database["public"]["Enums"]["community_report_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string | null
          profile_id?: string | null
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolver_id?: string | null
          status?: Database["public"]["Enums"]["community_report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reposts: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_verified_override: {
        Row: {
          created_at: string
          note: string | null
          tier: Database["public"]["Enums"]["community_verified_tier"]
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          tier: Database["public"]["Enums"]["community_verified_tier"]
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          tier?: Database["public"]["Enums"]["community_verified_tier"]
          user_id?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      cookie_consents: {
        Row: {
          choice: string
          created_at: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          choice: string
          created_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          choice?: string
          created_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_balances: {
        Row: {
          balance: number
          monthly_allowance: number
          period_resets_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          monthly_allowance?: number
          period_resets_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          monthly_allowance?: number
          period_resets_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_charge_audit: {
        Row: {
          amount: number
          balance_after: number | null
          caller: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string
          request_ip: string | null
          scan_id: string | null
          source: string
          symbol: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          caller?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          request_ip?: string | null
          scan_id?: string | null
          source: string
          symbol?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          caller?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          request_ip?: string | null
          scan_id?: string | null
          source?: string
          symbol?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          balance_after: number
          completion_tokens: number | null
          created_at: string
          delta: number
          id: string
          metadata: Json
          model: string | null
          prompt_tokens: number | null
          raw_cost_usd: number | null
          reason: string
          stage: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          completion_tokens?: number | null
          created_at?: string
          delta: number
          id?: string
          metadata?: Json
          model?: string | null
          prompt_tokens?: number | null
          raw_cost_usd?: number | null
          reason: string
          stage?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          completion_tokens?: number | null
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json
          model?: string | null
          prompt_tokens?: number | null
          raw_cost_usd?: number | null
          reason?: string
          stage?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_lots: {
        Row: {
          amount_granted: number
          amount_remaining: number
          expires_at: string
          granted_at: string
          id: string
          metadata: Json
          reason: string
          user_id: string
        }
        Insert: {
          amount_granted: number
          amount_remaining: number
          expires_at: string
          granted_at?: string
          id?: string
          metadata?: Json
          reason: string
          user_id: string
        }
        Update: {
          amount_granted?: number
          amount_remaining?: number
          expires_at?: string
          granted_at?: string
          id?: string
          metadata?: Json
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_auth_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          purpose: string
          recovery_link: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          full_name?: string | null
          id?: string
          purpose: string
          recovery_link?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          purpose?: string
          recovery_link?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_change_requests: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          new_email: string
          old_email: string
          token_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          new_email: string
          old_email: string
          token_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          new_email?: string
          old_email?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      error_group: {
        Row: {
          ai_analyzed_at: string | null
          ai_model: string | null
          ai_root_cause: string | null
          ai_suggested_fix: string | null
          fingerprint: string
          first_seen: string
          last_seen: string
          occurrences: number
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          sample_message: string
          sample_route: string | null
          sample_stack: string | null
          severity: string
          status: string
          telegram_notified_at: string | null
        }
        Insert: {
          ai_analyzed_at?: string | null
          ai_model?: string | null
          ai_root_cause?: string | null
          ai_suggested_fix?: string | null
          fingerprint: string
          first_seen?: string
          last_seen?: string
          occurrences?: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sample_message: string
          sample_route?: string | null
          sample_stack?: string | null
          severity?: string
          status?: string
          telegram_notified_at?: string | null
        }
        Update: {
          ai_analyzed_at?: string | null
          ai_model?: string | null
          ai_root_cause?: string | null
          ai_suggested_fix?: string | null
          fingerprint?: string
          first_seen?: string
          last_seen?: string
          occurrences?: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sample_message?: string
          sample_route?: string | null
          sample_stack?: string | null
          severity?: string
          status?: string
          telegram_notified_at?: string | null
        }
        Relationships: []
      }
      error_log: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          mechanism: string | null
          message: string
          metadata: Json
          request_ip: string | null
          route: string | null
          severity: string
          source: string
          stack: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          mechanism?: string | null
          message: string
          metadata?: Json
          request_ip?: string | null
          route?: string | null
          severity?: string
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          mechanism?: string | null
          message?: string
          metadata?: Json
          request_ip?: string | null
          route?: string | null
          severity?: string
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      extension_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      founding_applications: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          broker: string | null
          country: string | null
          created_at: string
          document_status: string
          documents_info_request: string | null
          documents_info_requested_at: string | null
          documents_note: string | null
          documents_rejected_at: string | null
          documents_rejected_reason: string | null
          documents_submitted_at: string | null
          documents_verified_at: string | null
          email: string
          experience_years: number | null
          first_profit_at: string | null
          full_name: string
          id: string
          ip_address: string | null
          monthly_volume_usd: number | null
          myfxbook_url: string | null
          referral_rewarded: boolean
          referrer_email: string | null
          requested_plan: string
          seat_month: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
          whatsapp_number: string | null
          why_joining: string | null
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          broker?: string | null
          country?: string | null
          created_at?: string
          document_status?: string
          documents_info_request?: string | null
          documents_info_requested_at?: string | null
          documents_note?: string | null
          documents_rejected_at?: string | null
          documents_rejected_reason?: string | null
          documents_submitted_at?: string | null
          documents_verified_at?: string | null
          email: string
          experience_years?: number | null
          first_profit_at?: string | null
          full_name: string
          id?: string
          ip_address?: string | null
          monthly_volume_usd?: number | null
          myfxbook_url?: string | null
          referral_rewarded?: boolean
          referrer_email?: string | null
          requested_plan?: string
          seat_month?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          whatsapp_number?: string | null
          why_joining?: string | null
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          broker?: string | null
          country?: string | null
          created_at?: string
          document_status?: string
          documents_info_request?: string | null
          documents_info_requested_at?: string | null
          documents_note?: string | null
          documents_rejected_at?: string | null
          documents_rejected_reason?: string | null
          documents_submitted_at?: string | null
          documents_verified_at?: string | null
          email?: string
          experience_years?: number | null
          first_profit_at?: string | null
          full_name?: string
          id?: string
          ip_address?: string | null
          monthly_volume_usd?: number | null
          myfxbook_url?: string | null
          referral_rewarded?: boolean
          referrer_email?: string | null
          requested_plan?: string
          seat_month?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          whatsapp_number?: string | null
          why_joining?: string | null
        }
        Relationships: []
      }
      founding_documents: {
        Row: {
          application_id: string
          created_at: string
          file_size: number
          id: string
          mime_type: string
          original_name: string | null
          storage_path: string
          user_id: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          file_size?: number
          id?: string
          mime_type: string
          original_name?: string | null
          storage_path: string
          user_id?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          file_size?: number
          id?: string
          mime_type?: string
          original_name?: string | null
          storage_path?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "founding_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "founding_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_topics: {
        Row: {
          angle: string | null
          category: string
          created_at: string
          id: string
          keyword: string
          last_used_at: string | null
          priority: number
        }
        Insert: {
          angle?: string | null
          category?: string
          created_at?: string
          id?: string
          keyword: string
          last_used_at?: string | null
          priority?: number
        }
        Update: {
          angle?: string | null
          category?: string
          created_at?: string
          id?: string
          keyword?: string
          last_used_at?: string | null
          priority?: number
        }
        Relationships: []
      }
      insights: {
        Row: {
          category: string
          content: string
          created_at: string
          excerpt: string
          id: string
          image_url: string | null
          index_status: Json | null
          indexed_at: string | null
          is_breaking: boolean | null
          notified_at: string | null
          published_at: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          excerpt: string
          id?: string
          image_url?: string | null
          index_status?: Json | null
          indexed_at?: string | null
          is_breaking?: boolean | null
          notified_at?: string | null
          published_at?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          excerpt?: string
          id?: string
          image_url?: string | null
          index_status?: Json | null
          indexed_at?: string | null
          is_breaking?: boolean | null
          notified_at?: string | null
          published_at?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      killzone_briefs: {
        Row: {
          audio_duration_seconds: number | null
          audio_path: string | null
          created_at: string
          headline: string
          id: string
          is_public: boolean
          metadata: Json
          published_at: string
          script: string
          session: Database["public"]["Enums"]["killzone_session"]
          summary: string | null
          transcript: string
          updated_at: string
        }
        Insert: {
          audio_duration_seconds?: number | null
          audio_path?: string | null
          created_at?: string
          headline: string
          id?: string
          is_public?: boolean
          metadata?: Json
          published_at?: string
          script: string
          session: Database["public"]["Enums"]["killzone_session"]
          summary?: string | null
          transcript: string
          updated_at?: string
        }
        Update: {
          audio_duration_seconds?: number | null
          audio_path?: string | null
          created_at?: string
          headline?: string
          id?: string
          is_public?: boolean
          metadata?: Json
          published_at?: string
          script?: string
          session?: Database["public"]["Enums"]["killzone_session"]
          summary?: string | null
          transcript?: string
          updated_at?: string
        }
        Relationships: []
      }
      lg_lead_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lg_leads: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          dedupe_key: string
          email: string | null
          external_id: string | null
          id: string
          list_id: string | null
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          raw: Json
          revealed: boolean
          reviews: number | null
          socials: Json
          source: string
          status: string
          title: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          dedupe_key: string
          email?: string | null
          external_id?: string | null
          id?: string
          list_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          raw?: Json
          revealed?: boolean
          reviews?: number | null
          socials?: Json
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          dedupe_key?: string
          email?: string | null
          external_id?: string | null
          id?: string
          list_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          raw?: Json
          revealed?: boolean
          reviews?: number | null
          socials?: Json
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lg_leads_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lg_lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lg_profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          is_disabled: boolean
          monthly_credit_limit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          is_disabled?: boolean
          monthly_credit_limit?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          is_disabled?: boolean
          monthly_credit_limit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lg_role_grants: {
        Row: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["lg_role"]
        }
        Insert: {
          created_at?: string
          email: string
          role: Database["public"]["Enums"]["lg_role"]
        }
        Update: {
          created_at?: string
          email?: string
          role?: Database["public"]["Enums"]["lg_role"]
        }
        Relationships: []
      }
      lg_saved_searches: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string | null
          params: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          params?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          params?: Json
          user_id?: string
        }
        Relationships: []
      }
      lg_search_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          payload: Json
          provider: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          payload: Json
          provider: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          payload?: Json
          provider?: string
        }
        Relationships: []
      }
      lg_usage_events: {
        Row: {
          created_at: string
          credits: number
          id: string
          kind: string
          meta: Json
          ref_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          kind: string
          meta?: Json
          ref_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          kind?: string
          meta?: Json
          ref_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lg_user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["lg_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["lg_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["lg_role"]
          user_id?: string
        }
        Relationships: []
      }
      mail_addresses: {
        Row: {
          address: string
          created_at: string
          id: string
          is_primary: boolean
          local_part: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_primary?: boolean
          local_part: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          local_part?: string
          user_id?: string
        }
        Relationships: []
      }
      mail_message_state: {
        Row: {
          folder: string
          is_read: boolean
          is_starred: boolean
          message_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          folder?: string
          is_read?: boolean
          is_starred?: boolean
          message_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          folder?: string
          is_read?: boolean
          is_starred?: boolean
          message_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_message_state_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "mail_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          recipient_address: string
          recipient_id: string | null
          sender_address: string
          sender_id: string | null
          subject: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          recipient_address: string
          recipient_id?: string | null
          sender_address: string
          sender_id?: string | null
          subject?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          recipient_address?: string
          recipient_id?: string | null
          sender_address?: string
          sender_id?: string | null
          subject?: string
        }
        Relationships: []
      }
      news_event_notifications: {
        Row: {
          country: string | null
          created_at: string
          emails_enqueued: number
          event_at: string | null
          event_key: string
          id: string
          impact: string | null
          recipients: number
          title: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          emails_enqueued?: number
          event_at?: string | null
          event_key: string
          id?: string
          impact?: string | null
          recipients?: number
          title: string
        }
        Update: {
          country?: string | null
          created_at?: string
          emails_enqueued?: number
          event_at?: string | null
          event_key?: string
          id?: string
          impact?: string | null
          recipients?: number
          title?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          status: string
          subscribed_at: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          status?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          status?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          auto_result: Json | null
          bonus_usd: number
          created_at: string
          credit_usd: number
          credited_usd: number | null
          decided_at: string | null
          decided_by: string | null
          deposit_address: string
          email: string | null
          expires_at: string
          id: string
          network: string
          pay_amount_usd: number
          promo_code: string | null
          reject_reason: string | null
          status: string
          submitted_at: string | null
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          auto_result?: Json | null
          bonus_usd?: number
          created_at?: string
          credit_usd: number
          credited_usd?: number | null
          decided_at?: string | null
          decided_by?: string | null
          deposit_address: string
          email?: string | null
          expires_at?: string
          id?: string
          network: string
          pay_amount_usd: number
          promo_code?: string | null
          reject_reason?: string | null
          status?: string
          submitted_at?: string | null
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          auto_result?: Json | null
          bonus_usd?: number
          created_at?: string
          credit_usd?: number
          credited_usd?: number | null
          decided_at?: string | null
          decided_by?: string | null
          deposit_address?: string
          email?: string | null
          expires_at?: string
          id?: string
          network?: string
          pay_amount_usd?: number
          promo_code?: string | null
          reject_reason?: string | null
          status?: string
          submitted_at?: string | null
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          annual_discount_pct: number | null
          annual_price_usd: number | null
          created_at: string
          feature_full_ict: boolean
          feature_journal: boolean
          feature_realtime_alerts: boolean
          feature_scanner: boolean
          id: string
          markup_multiplier: number
          monthly_credits: number
          name: string
          price_usd: number
          rollover_months: number
          sort_order: number
          wallet_usd: number
        }
        Insert: {
          annual_discount_pct?: number | null
          annual_price_usd?: number | null
          created_at?: string
          feature_full_ict?: boolean
          feature_journal?: boolean
          feature_realtime_alerts?: boolean
          feature_scanner?: boolean
          id: string
          markup_multiplier?: number
          monthly_credits?: number
          name: string
          price_usd?: number
          rollover_months?: number
          sort_order?: number
          wallet_usd?: number
        }
        Update: {
          annual_discount_pct?: number | null
          annual_price_usd?: number | null
          created_at?: string
          feature_full_ict?: boolean
          feature_journal?: boolean
          feature_realtime_alerts?: boolean
          feature_scanner?: boolean
          id?: string
          markup_multiplier?: number
          monthly_credits?: number
          name?: string
          price_usd?: number
          rollover_months?: number
          sort_order?: number
          wallet_usd?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alerts_last_seen_at: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          journal_last_seen_at: string | null
          killzone_notice_dismissed: boolean
          plan: string
          saved_last_seen_at: string | null
          updated_at: string
        }
        Insert: {
          alerts_last_seen_at?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          journal_last_seen_at?: string | null
          killzone_notice_dismissed?: boolean
          plan?: string
          saved_last_seen_at?: string | null
          updated_at?: string
        }
        Update: {
          alerts_last_seen_at?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          journal_last_seen_at?: string | null
          killzone_notice_dismissed?: boolean
          plan?: string
          saved_last_seen_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_at: string | null
          max_bonus_usd: number | null
          min_topup_usd: number
          note: string | null
          per_user_limit: number
          type: string
          usage_limit: number | null
          used_count: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_at?: string | null
          max_bonus_usd?: number | null
          min_topup_usd?: number
          note?: string | null
          per_user_limit?: number
          type: string
          usage_limit?: number | null
          used_count?: number
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_at?: string | null
          max_bonus_usd?: number | null
          min_topup_usd?: number
          note?: string | null
          per_user_limit?: number
          type?: string
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          converted_at: string | null
          created_at: string
          credits_awarded: number
          id: string
          referred_user_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          code: string
          converted_at?: string | null
          created_at?: string
          credits_awarded?: number
          id?: string
          referred_user_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          code?: string
          converted_at?: string | null
          created_at?: string
          credits_awarded?: number
          id?: string
          referred_user_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      saved_signals: {
        Row: {
          alert_id: string | null
          created_at: string
          id: string
          notes: string | null
          snapshot: Json | null
          user_id: string
        }
        Insert: {
          alert_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          snapshot?: Json | null
          user_id: string
        }
        Update: {
          alert_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          snapshot?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_signals_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "signal_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_alert_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      signal_alerts: {
        Row: {
          confidence: number | null
          created_at: string
          direction: string
          entry: number
          fired_at: string
          grade: string
          htf_bias: string | null
          id: string
          killzone: string | null
          markings: Json | null
          models_used: string[] | null
          narration: Json | null
          pair: string
          rationale: string | null
          rr: number | null
          session: string | null
          setup_score: number | null
          sl: number
          structure: Json | null
          swings: Json | null
          tp: number
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          direction: string
          entry: number
          fired_at?: string
          grade: string
          htf_bias?: string | null
          id?: string
          killzone?: string | null
          markings?: Json | null
          models_used?: string[] | null
          narration?: Json | null
          pair?: string
          rationale?: string | null
          rr?: number | null
          session?: string | null
          setup_score?: number | null
          sl: number
          structure?: Json | null
          swings?: Json | null
          tp: number
        }
        Update: {
          confidence?: number | null
          created_at?: string
          direction?: string
          entry?: number
          fired_at?: string
          grade?: string
          htf_bias?: string | null
          id?: string
          killzone?: string | null
          markings?: Json | null
          models_used?: string[] | null
          narration?: Json | null
          pair?: string
          rationale?: string | null
          rr?: number | null
          session?: string | null
          setup_score?: number | null
          sl?: number
          structure?: Json | null
          swings?: Json | null
          tp?: number
        }
        Relationships: []
      }
      signal_confidence_memory: {
        Row: {
          direction: string
          pair: string
          raw_conf: number
          smoothed_conf: number
          updated_at: string
        }
        Insert: {
          direction: string
          pair: string
          raw_conf: number
          smoothed_conf: number
          updated_at?: string
        }
        Update: {
          direction?: string
          pair?: string
          raw_conf?: number
          smoothed_conf?: number
          updated_at?: string
        }
        Relationships: []
      }
      signal_locks: {
        Row: {
          created_at: string
          direction: string
          entry_px: number
          expires_at: string
          instrument: string
          signal: Json
          sl_px: number
          timeframe: string
          tp1_px: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          entry_px: number
          expires_at: string
          instrument: string
          signal: Json
          sl_px: number
          timeframe: string
          tp1_px?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          entry_px?: number
          expires_at?: string
          instrument?: string
          signal?: Json
          sl_px?: number
          timeframe?: string
          tp1_px?: number | null
          user_id?: string
        }
        Relationships: []
      }
      signal_paper_trades: {
        Row: {
          broadcast_alert_id: string | null
          confidence: number
          created_at: string
          direction: string
          entry: number
          fired_at: string
          gates: Json
          grade: string | null
          htf_bias: string | null
          id: string
          killzone: string | null
          models_used: string[] | null
          notes: string | null
          outcome: string | null
          pair: string
          realized_r: number | null
          resolution_method: string | null
          resolved_at: string | null
          reversal_notified_at: string | null
          rr: number | null
          session: string | null
          setup_score: number | null
          sl: number
          tp: number
        }
        Insert: {
          broadcast_alert_id?: string | null
          confidence: number
          created_at?: string
          direction: string
          entry: number
          fired_at?: string
          gates?: Json
          grade?: string | null
          htf_bias?: string | null
          id?: string
          killzone?: string | null
          models_used?: string[] | null
          notes?: string | null
          outcome?: string | null
          pair: string
          realized_r?: number | null
          resolution_method?: string | null
          resolved_at?: string | null
          reversal_notified_at?: string | null
          rr?: number | null
          session?: string | null
          setup_score?: number | null
          sl: number
          tp: number
        }
        Update: {
          broadcast_alert_id?: string | null
          confidence?: number
          created_at?: string
          direction?: string
          entry?: number
          fired_at?: string
          gates?: Json
          grade?: string | null
          htf_bias?: string | null
          id?: string
          killzone?: string | null
          models_used?: string[] | null
          notes?: string | null
          outcome?: string | null
          pair?: string
          realized_r?: number | null
          resolution_method?: string | null
          resolved_at?: string | null
          reversal_notified_at?: string | null
          rr?: number | null
          session?: string | null
          setup_score?: number | null
          sl?: number
          tp?: number
        }
        Relationships: []
      }
      signal_weight_configs: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          retired_at: string | null
          status: string
          updated_at: string
          validated: boolean
          validated_at: string | null
          validation_summary: Json | null
          version: number
          weights: Json
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          retired_at?: string | null
          status?: string
          updated_at?: string
          validated?: boolean
          validated_at?: string | null
          validation_summary?: Json | null
          version: number
          weights: Json
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          retired_at?: string | null
          status?: string
          updated_at?: string
          validated?: boolean
          validated_at?: string | null
          validation_summary?: Json | null
          version?: number
          weights?: Json
        }
        Relationships: []
      }
      signal_weight_tuning_runs: {
        Row: {
          best_config_id: string | null
          combinations_tested: number
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          metrics: Json
          mode: string
          range_end: string
          range_start: string
          started_at: string
          status: string
          symbol: string
        }
        Insert: {
          best_config_id?: string | null
          combinations_tested?: number
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          metrics?: Json
          mode: string
          range_end: string
          range_start: string
          started_at?: string
          status?: string
          symbol: string
        }
        Update: {
          best_config_id?: string | null
          combinations_tested?: number
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          metrics?: Json
          mode?: string
          range_end?: string
          range_start?: string
          started_at?: string
          status?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_weight_tuning_runs_best_config_id_fkey"
            columns: ["best_config_id"]
            isOneToOne: false
            referencedRelation: "signal_weight_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_weight_window_results: {
        Row: {
          config_id: string | null
          created_at: string
          expectancy_r: number | null
          fold_index: number
          id: string
          in_sample_end: string
          in_sample_start: string
          in_sample_win_rate: number | null
          max_drawdown_r: number | null
          metrics: Json
          oos_end: string
          oos_start: string
          passed: boolean
          run_id: string
          sample_size: number
          win_rate: number | null
        }
        Insert: {
          config_id?: string | null
          created_at?: string
          expectancy_r?: number | null
          fold_index: number
          id?: string
          in_sample_end: string
          in_sample_start: string
          in_sample_win_rate?: number | null
          max_drawdown_r?: number | null
          metrics?: Json
          oos_end: string
          oos_start: string
          passed?: boolean
          run_id: string
          sample_size?: number
          win_rate?: number | null
        }
        Update: {
          config_id?: string | null
          created_at?: string
          expectancy_r?: number | null
          fold_index?: number
          id?: string
          in_sample_end?: string
          in_sample_start?: string
          in_sample_win_rate?: number | null
          max_drawdown_r?: number | null
          metrics?: Json
          oos_end?: string
          oos_start?: string
          passed?: boolean
          run_id?: string
          sample_size?: number
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_weight_window_results_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "signal_weight_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_weight_window_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "signal_weight_tuning_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_attempts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          ip: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          ip: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      telegram_alert_links: {
        Row: {
          bot_token: string | null
          chat_id: string
          created_at: string
          last_error: string | null
          telegram_enabled: boolean
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          bot_token?: string | null
          chat_id: string
          created_at?: string
          last_error?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          bot_token?: string | null
          chat_id?: string
          created_at?: string
          last_error?: string | null
          telegram_enabled?: boolean
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      topup_packs: {
        Row: {
          credits: number
          id: string
          label: string
          price_usd: number
          sort_order: number
        }
        Insert: {
          credits: number
          id: string
          label: string
          price_usd: number
          sort_order?: number
        }
        Update: {
          credits?: number
          id?: string
          label?: string
          price_usd?: number
          sort_order?: number
        }
        Relationships: []
      }
      trade_journal: {
        Row: {
          closed_at: string | null
          created_at: string
          direction: string
          entry: number | null
          id: string
          notes: string | null
          opened_at: string
          outcome: string
          pair: string
          pnl: number | null
          source: string
          stop_loss: number | null
          take_profit: number | null
          tp1_hit_at: string | null
          tp2_hit_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          direction: string
          entry?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          outcome?: string
          pair?: string
          pnl?: number | null
          source?: string
          stop_loss?: number | null
          take_profit?: number | null
          tp1_hit_at?: string | null
          tp2_hit_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          direction?: string
          entry?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          outcome?: string
          pair?: string
          pnl?: number | null
          source?: string
          stop_loss?: number | null
          take_profit?: number | null
          tp1_hit_at?: string | null
          tp2_hit_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_setup_links: {
        Row: {
          created_at: string
          setup_id: string
          trade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          setup_id: string
          trade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          setup_id?: string
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_setup_links_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "trade_setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_setup_links_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trade_journal"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_setups: {
        Row: {
          category: string
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trial_claims: {
        Row: {
          created_at: string
          fingerprint: string | null
          id: string
          ip_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprint?: string | null
          id?: string
          ip_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprint?: string | null
          id?: string
          ip_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trusted_devices: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          label: string | null
          last_used_at: string
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          last_used_at?: string
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          last_used_at?: string
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_risk_settings: {
        Row: {
          account_balance_usd: number
          created_at: string
          daily_loss_limit_usd: number | null
          kill_switch_enabled: boolean
          risk_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_balance_usd?: number
          created_at?: string
          daily_loss_limit_usd?: number | null
          kill_switch_enabled?: boolean
          risk_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_balance_usd?: number
          created_at?: string
          daily_loss_limit_usd?: number | null
          kill_switch_enabled?: boolean
          risk_pct?: number
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
      user_subscriptions: {
        Row: {
          billing_interval: string
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          is_trial: boolean
          plan_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          is_trial?: boolean
          plan_id: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          is_trial?: boolean
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_history: {
        Row: {
          created_at: string
          id: string
          query: string
          reply: string
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          reply: string
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          reply?: string
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_scan_charge_mismatches: {
        Row: {
          callers: string[] | null
          charge_count: number | null
          first_at: string | null
          last_at: string | null
          reasons: string[] | null
          scan_id: string | null
          sources: string[] | null
          total_amount: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      __apply_migration: { Args: { sql: string }; Returns: undefined }
      admin_auto_scan_cron_history: {
        Args: never
        Returns: {
          end_time: string
          job_pid: number
          jobid: number
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      apply_referral_code: { Args: { _code: string }; Returns: Json }
      award_founding_referral: {
        Args: { _application_id: string }
        Returns: Json
      }
      award_founding_referral_by_user: {
        Args: { _user_id: string }
        Returns: undefined
      }
      bug_notify_dispatch: {
        Args: { _fingerprint: string; _kind: string; _occurrences: number }
        Returns: undefined
      }
      close_chat_session: { Args: { _session_id: string }; Returns: undefined }
      community_bump_counter: {
        Args: { _col: string; _delta: number; _post_id: string }
        Returns: undefined
      }
      community_get_tier: { Args: { _user_id: string }; Returns: string }
      convert_referral: { Args: { _user_id: string }; Returns: undefined }
      create_chat_session: {
        Args: { _email: string; _name: string; _user_agent?: string }
        Returns: {
          session_id: string
          session_token: string
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      error_fingerprint: {
        Args: { _message: string; _stack: string }
        Returns: string
      }
      expire_credits: { Args: never; Returns: number }
      expire_pro_trials: { Args: never; Returns: number }
      get_guest_messages: {
        Args: { _token: string }
        Returns: {
          content: string
          created_at: string
          id: string
          sender: string
          session_status: string
        }[]
      }
      get_or_create_referral_code: {
        Args: { _user_id: string }
        Returns: string
      }
      grant_credits: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      grant_monthly_credits: { Args: never; Returns: number }
      has_lg_role: {
        Args: {
          _role: Database["public"]["Enums"]["lg_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      journal_stats: { Args: { _from?: string; _to?: string }; Returns: Json }
      lg_charge_credits: {
        Args: {
          _credits: number
          _kind: string
          _meta?: Json
          _ref?: string
          _user_id: string
        }
        Returns: number
      }
      lg_credit_state: {
        Args: { _user_id?: string }
        Returns: {
          monthly_limit: number
          remaining: number
          used: number
        }[]
      }
      log_charge_audit: {
        Args: {
          _amount: number
          _balance_after: number
          _caller: string
          _metadata?: Json
          _reason: string
          _request_ip: string
          _scan_id: string
          _source: string
          _symbol: string
          _user_agent: string
          _user_id: string
        }
        Returns: string
      }
      log_error: {
        Args: {
          _mechanism?: string
          _message: string
          _metadata?: Json
          _route?: string
          _severity?: string
          _source?: string
          _stack?: string
          _user_agent?: string
        }
        Returns: string
      }
      mail_claim_address: { Args: { _local_part: string }; Returns: string }
      mail_directory_search: {
        Args: { _q: string }
        Returns: {
          address: string
          full_name: string
        }[]
      }
      mail_get_badges: {
        Args: { _addresses: string[] }
        Returns: {
          address: string
          tier: string
        }[]
      }
      mail_list_my_addresses: {
        Args: never
        Returns: {
          address: string
          created_at: string
          is_primary: boolean
          local_part: string
        }[]
      }
      mail_send:
        | {
            Args: { _body: string; _subject: string; _to_address: string }
            Returns: string
          }
        | {
            Args: {
              _body: string
              _from_address?: string
              _subject: string
              _to_address: string
            }
            Returns: string
          }
      mail_system_send: {
        Args: {
          _body: string
          _from_address: string
          _subject: string
          _to_user_id: string
        }
        Returns: string
      }
      mark_chat_read: { Args: { _session_id: string }; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      post_admin_message: {
        Args: { _content: string; _session_id: string }
        Returns: string
      }
      post_guest_message: {
        Args: { _content: string; _token: string }
        Returns: string
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      resync_all_credit_lots: { Args: never; Returns: number }
      revoke_pro_trial: {
        Args: { _reason?: string; _user_id: string }
        Returns: undefined
      }
      seed_default_setups: { Args: { _user_id: string }; Returns: undefined }
      set_user_plan: {
        Args: { _billing_interval?: string; _plan_id: string; _user_id: string }
        Returns: undefined
      }
      spend_credits: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      user_has_plan_feature: {
        Args: { _feature: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      community_report_status: "open" | "reviewed" | "actioned" | "dismissed"
      community_verified_tier: "gold" | "blue"
      killzone_session: "london" | "new_york" | "asia"
      lg_role: "admin" | "member"
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
      app_role: ["admin", "moderator", "user"],
      community_report_status: ["open", "reviewed", "actioned", "dismissed"],
      community_verified_tier: ["gold", "blue"],
      killzone_session: ["london", "new_york", "asia"],
      lg_role: ["admin", "member"],
    },
  },
} as const
