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
      audit_logs: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      classes: {
        Row: {
          academic_year: string | null
          created_at: string
          grade_id: string | null
          id: string
          name: string
        }
        Insert: {
          academic_year?: string | null
          created_at?: string
          grade_id?: string | null
          id?: string
          name: string
        }
        Update: {
          academic_year?: string | null
          created_at?: string
          grade_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tracking: {
        Row: {
          created_at: string
          delivered: boolean
          delivered_at: string | null
          delivered_by: string | null
          id: string
          item: string
          notes: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          delivered?: boolean
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          item: string
          notes?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          delivered?: boolean
          delivered_at?: string | null
          delivered_by?: string | null
          id?: string
          item?: string
          notes?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tracking_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string
          id: string
          level: number | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: number | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: number | null
          name?: string
        }
        Relationships: []
      }
      installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          label: string
          paid_amount: number
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          label: string
          paid_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          paid_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: Database["public"]["Enums"]["app_role"]
          full_name: string
          id: string
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          department: Database["public"]["Enums"]["app_role"]
          full_name: string
          id: string
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          department?: Database["public"]["Enums"]["app_role"]
          full_name?: string
          id?: string
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          activity_fees: number
          amount: number
          approved_by: string | null
          created_at: string
          education_fees: number
          file_url: string | null
          id: string
          installment_id: string | null
          ocr_confidence: number | null
          ocr_raw: Json | null
          payer_name: string | null
          receipt_date: string | null
          receipt_number: string | null
          status: Database["public"]["Enums"]["receipt_status"]
          student_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          activity_fees?: number
          amount?: number
          approved_by?: string | null
          created_at?: string
          education_fees?: number
          file_url?: string | null
          id?: string
          installment_id?: string | null
          ocr_confidence?: number | null
          ocr_raw?: Json | null
          payer_name?: string | null
          receipt_date?: string | null
          receipt_number?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          student_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          activity_fees?: number
          amount?: number
          approved_by?: string | null
          created_at?: string
          education_fees?: number
          file_url?: string | null
          id?: string
          installment_id?: string | null
          ocr_confidence?: number | null
          ocr_raw?: Json | null
          payer_name?: string | null
          receipt_date?: string | null
          receipt_number?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          student_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_imports: {
        Row: {
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          imported_by: string | null
          rows_inserted: number | null
          rows_skipped: number | null
          rows_total: number | null
          rows_updated: number | null
          summary: Json | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          imported_by?: string | null
          rows_inserted?: number | null
          rows_skipped?: number | null
          rows_total?: number | null
          rows_updated?: number | null
          summary?: Json | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          imported_by?: string | null
          rows_inserted?: number | null
          rows_skipped?: number | null
          rows_total?: number | null
          rows_updated?: number | null
          summary?: Json | null
        }
        Relationships: []
      }
      students: {
        Row: {
          class_id: string | null
          created_at: string
          created_by: string | null
          first_installment: number
          full_name: string
          grade_id: string | null
          guardian_name: string | null
          id: string
          national_id: string | null
          notes: string | null
          other_fees: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          previous_installments: number
          remaining_balance: number | null
          second_installment: number
          student_code: string | null
          total_due: number | null
          total_paid: number
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          first_installment?: number
          full_name: string
          grade_id?: string | null
          guardian_name?: string | null
          id?: string
          national_id?: string | null
          notes?: string | null
          other_fees?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          previous_installments?: number
          remaining_balance?: number | null
          second_installment?: number
          student_code?: string | null
          total_due?: number | null
          total_paid?: number
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          first_installment?: number
          full_name?: string
          grade_id?: string | null
          guardian_name?: string | null
          id?: string
          national_id?: string | null
          notes?: string | null
          other_fees?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          previous_installments?: number
          remaining_balance?: number | null
          second_installment?: number
          student_code?: string | null
          total_due?: number | null
          total_paid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      recompute_student_totals: {
        Args: { _student_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "pending" | "approved" | "rejected"
      app_role: "admin" | "student_affairs" | "finance"
      payment_status: "paid" | "partial" | "unpaid"
      receipt_status: "pending" | "approved" | "rejected"
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
      account_status: ["pending", "approved", "rejected"],
      app_role: ["admin", "student_affairs", "finance"],
      payment_status: ["paid", "partial", "unpaid"],
      receipt_status: ["pending", "approved", "rejected"],
    },
  },
} as const
