"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { MessageSquare, Send } from "lucide-react"

interface Note {
  id: string
  note: string
  created_at: string
  profiles: {
    full_name: string
    role: string
  } | null
}

interface NotesProps {
  notes: Note[]
  referenceId: string
  referenceType: "invoice" | "payment"
  userRole?: string
}

export function Notes({ notes: initialNotes, referenceId, referenceType, userRole }: NotesProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [newNote, setNewNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const [supabase] = useState(() => createClient())

  const canAddNotes = userRole === "super_admin" || userRole === "admin"

  // Fetch notes on mount and set up real-time subscription
  useEffect(() => {
    const fetchNotes = async () => {
      const tableName = referenceType === "invoice" ? "invoice_notes" : "payment_notes"
      const foreignKey = referenceType === "invoice" ? "invoice_id" : "payment_id"

      // Fetch notes without join first
      const { data: fetchedNotes, error: fetchError } = await supabase
        .from(tableName)
        .select("id, note, created_at, created_by")
        .eq(foreignKey, referenceId)
        .order("created_at", { ascending: false })

      if (fetchedNotes && fetchedNotes.length > 0) {
        // Fetch profiles for all notes
        const createdByIds = [...new Set(fetchedNotes.map((note: any) => note.created_by))]
        
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("id", createdByIds)

        // Combine notes with profiles
        const notesWithProfiles = fetchedNotes.map((note: any) => {
          const profile = profiles?.find((p: any) => p.id === note.created_by)
          return {
            id: note.id,
            note: note.note,
            created_at: note.created_at,
            profiles: profile ? {
              full_name: profile.full_name,
              role: profile.role
            } : null
          }
        }).filter((note: any) => note.profiles !== null)

        setNotes(notesWithProfiles)
      } else {
        setNotes([])
      }
    }

    fetchNotes()

    // Set up real-time subscription
    const tableName = referenceType === "invoice" ? "invoice_notes" : "payment_notes"
    const channel = supabase
      .channel(`${tableName}-${referenceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: tableName,
          filter: `${referenceType === "invoice" ? "invoice_id" : "payment_id"}=eq.${referenceId}`,
        },
        async (payload) => {
          // Refetch notes when changes occur
          const foreignKey = referenceType === "invoice" ? "invoice_id" : "payment_id"

          const { data: updatedNotes } = await supabase
            .from(tableName)
            .select("id, note, created_at, created_by")
            .eq(foreignKey, referenceId)
            .order("created_at", { ascending: false })

          if (updatedNotes && updatedNotes.length > 0) {
            // Fetch profiles
            const createdByIds = [...new Set(updatedNotes.map((note: any) => note.created_by))]
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, full_name, role")
              .in("id", createdByIds)

            // Combine
            const notesWithProfiles = updatedNotes.map((note: any) => {
              const profile = profiles?.find((p: any) => p.id === note.created_by)
              return {
                id: note.id,
                note: note.note,
                created_at: note.created_at,
                profiles: profile ? {
                  full_name: profile.full_name,
                  role: profile.role
                } : null
              }
            }).filter((note: any) => note.profiles !== null)

            setNotes(notesWithProfiles)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [referenceId, referenceType, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newNote.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a note before submitting.",
      })
      return
    }

    setIsSubmitting(true)

    const tableName = referenceType === "invoice" ? "invoice_notes" : "payment_notes"
    const foreignKey = referenceType === "invoice" ? "invoice_id" : "payment_id"

    const { data: userData } = await supabase.auth.getUser()
    
    if (!userData.user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to add notes.",
      })
      setIsSubmitting(false)
      return
    }

    const { error } = await supabase
      .from(tableName)
      .insert({
        [foreignKey]: referenceId,
        created_by: userData.user.id,
        note: newNote.trim(),
      })

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add note. Please try again.",
      })
    } else {
      toast({
        variant: "success",
        title: "Note added",
        description: "Your note has been added successfully.",
      })
      setNewNote("")
    }

    setIsSubmitting(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Notes & Comments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Note Form - Only for Admin/Manager */}
        {canAddNotes && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              placeholder="Add a note or comment..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              disabled={isSubmitting}
              className="resize-none"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting || !newNote.trim()} size="sm">
                <Send className="h-4 w-4 mr-2" />
                {isSubmitting ? "Adding..." : "Add Note"}
              </Button>
            </div>
          </form>
        )}

        {/* Notes List */}
        <div className="space-y-3">
          {notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No notes yet. {canAddNotes && "Be the first to add one!"}
            </div>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="border rounded-lg p-4 space-y-2 bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{note.profiles?.full_name || "Unknown User"}</span>
                    <Badge variant="outline" className="text-xs">
                      {note.profiles?.role || "Unknown"}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(note.created_at).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.note}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
