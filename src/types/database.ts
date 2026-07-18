export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      crate_tracks: {
        Row: {
          crate_id: string;
          created_at: string;
          position: number;
          track_id: string;
          user_id: string;
        };
        Insert: {
          crate_id: string;
          created_at?: string;
          position?: number;
          track_id: string;
          user_id: string;
        };
        Update: {
          crate_id?: string;
          created_at?: string;
          position?: number;
          track_id?: string;
          user_id?: string;
        };
        Relationships: Relationship[];
      };
      crates: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      track_tags: {
        Row: {
          created_at: string;
          tag_id: string;
          track_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          tag_id: string;
          track_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          tag_id?: string;
          track_id?: string;
          user_id?: string;
        };
        Relationships: Relationship[];
      };
      tracks: {
        Row: {
          album: string | null;
          analysis_status: string;
          artist: string;
          artwork_url: string | null;
          bpm: number | null;
          camelot_key: string | null;
          comments: string | null;
          created_at: string;
          duration_seconds: number | null;
          energy: number | null;
          file_fingerprint: string | null;
          file_name: string | null;
          file_size: number | null;
          file_type: string | null;
          genre: string | null;
          id: string;
          musical_key: string | null;
          rating: number | null;
          release_year: number | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          album?: string | null;
          analysis_status?: string;
          artist: string;
          artwork_url?: string | null;
          bpm?: number | null;
          camelot_key?: string | null;
          comments?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          energy?: number | null;
          file_fingerprint?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          file_type?: string | null;
          genre?: string | null;
          id?: string;
          musical_key?: string | null;
          rating?: number | null;
          release_year?: number | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          album?: string | null;
          analysis_status?: string;
          artist?: string;
          artwork_url?: string | null;
          bpm?: number | null;
          camelot_key?: string | null;
          comments?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          energy?: number | null;
          file_fingerprint?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          file_type?: string | null;
          genre?: string | null;
          id?: string;
          musical_key?: string | null;
          rating?: number | null;
          release_year?: number | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
