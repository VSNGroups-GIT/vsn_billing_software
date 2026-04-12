"use client"

import { useEffect, useState } from "react"
import { Bell, X, ExternalLink } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  reference_id: string
  reference_type: string
  is_read: boolean
  created_at: string
}

interface NotificationBellProps {
  userId: string
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [supabase] = useState(() => createClient())
  const DISPLAY_LIMIT = 5
  const { toast } = useToast()

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      const { data, count } = await supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(DISPLAY_LIMIT)

      if (!data) return

      setNotifications(data)
      setTotalCount(count ?? data.length)
      const unread = data.filter((n) => !n.is_read).length
      setUnreadCount(unread)
    }

    fetchNotifications()

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification
          setNotifications((prev) => [newNotification, ...prev].slice(0, DISPLAY_LIMIT))
          setTotalCount((prev) => prev + 1)
          setUnreadCount((prev) => prev + 1)

          // Show a toast to inform user about new notification
          toast({
            title: newNotification.title || "New notification",
            description: newNotification.message,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  const markAsRead = async (notificationId: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId)

    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)),
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const getNotificationLink = (notification: Notification) => {
    if (notification.reference_type === "invoice") {
      return `/dashboard/invoices/${notification.reference_id}`
    } else if (notification.reference_type === "payment") {
      return `/dashboard/payments/${notification.reference_id}`
    }
    return "#"
  }

  const deleteNotification = async (notificationId: string) => {
    await supabase.from("notifications").delete().eq("id", notificationId)
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
    setTotalCount((prev) => Math.max(0, prev - 1))
    setUnreadCount((prev) => {
      const notification = notifications.find((n) => n.id === notificationId)
      return notification && !notification.is_read ? Math.max(0, prev - 1) : prev
    })
  }

  const handleNotificationNavigation = (notification: Notification) => {
    if (!notification.is_read) {
      void markAsRead(notification.id)
    }
    setIsOpen(false)
  }

  const remainingCount = Math.max(0, totalCount - notifications.length)

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors duration-200"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-5 w-5 bg-red-500 text-white text-xs font-semibold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown Panel */}
            <div className="absolute right-full top-0 -ml-3 w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Notifications</h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-b-0",
                      !notification.is_read && "bg-blue-50",
                    )}
                  >
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900 text-sm">{notification.title}</p>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{notification.message}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-slate-500">
                            {new Date(notification.created_at).toLocaleDateString()} at{" "}
                            {new Date(notification.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {!notification.is_read && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Mark as read
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Link
                          href={getNotificationLink(notification)}
                          onClick={() => handleNotificationNavigation(notification)}
                          className="text-blue-600 hover:text-blue-700 p-1"
                          title="View"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => deleteNotification(notification.id)}
                          className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                          title="Delete"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer with View All button */}
            {totalCount > 0 && (
              <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-t border-slate-200">
                <Link
                  href="/dashboard/notifications"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  {remainingCount > 0 ? `View All (${remainingCount} more)` : "View All Notifications"}
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
