"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { LoadingOverlay } from "@/components/loading-overlay"
import { useToast } from "@/hooks/use-toast"
import { Eye, EyeOff } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        // Check if user is banned/deactivated
        if (error.message.toLowerCase().includes("user is banned") || 
            error.message.toLowerCase().includes("email not confirmed")) {
          throw new Error("Your account has been deactivated. Contact your administrator.")
        }
        throw error
      }
      
      // Get user profile to determine redirect based on role and active state
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active")
        .single()

      // If user is deactivated, immediately sign out and block access
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut()
        throw new Error("Your account has been deactivated. Contact your administrator.")
      }
      
      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      })
      
      // Redirect based on role - spinner will stay visible during navigation
      if (profile?.role === "accountant") {
        router.push("/dashboard/clients")
      } else {
        // Super Admin and Admin go to dashboard
        router.push("/dashboard")
      }
      // Note: setIsLoading(false) is intentionally not called here
      // The spinner will remain visible until the page fully loads
    } catch (error: unknown) {
      setIsLoading(false)
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: error instanceof Error ? error.message : "Invalid email or password",
      })
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Loading Spinner Overlay */}
      {isLoading && <LoadingOverlay />}
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col items-center gap-4">
            <Image
              src="/VSN%20Groups%20LOGO.jpeg"
              alt="Billing Management System logo"
              width={192}
              height={192}
              className="h-16 w-16 object-contain drop-shadow-lg"
              quality={100}
              priority
            />
            <div className="text-center">
              <h1 className="text-4xl font-bold tracking-tight text-slate-900">Invoice Pro</h1>
              <p className="text-sm text-slate-600 mt-2">Professional billing management</p>
            </div>
          </div>
          <Card className="border-slate-200 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Sign In</CardTitle>
              <CardDescription>Enter your credentials to access your account</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className="h-11"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        disabled={isLoading}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Spinner className="mr-2" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </div>
                <div className="mt-6 text-center text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <Link href="#" className="text-blue-600 hover:underline font-medium">
                    Contact your administrator
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
