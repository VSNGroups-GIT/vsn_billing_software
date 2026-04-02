"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function SignUpPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Image
              src="/VSN%20Groups%20LOGO.jpeg"
              alt="Billing Management System logo"
              width={168}
              height={168}
              className="h-14 w-14 object-contain drop-shadow-sm"
              quality={100}
              priority
            />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Invoice Pro</h1>
              <p className="text-sm text-muted-foreground">Professional billing management system</p>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Sign Up Disabled</CardTitle>
              <CardDescription>Public registration is not available</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">Account Creation Restricted</p>
                  <p className="text-sm text-amber-700 mt-1">
                    New user accounts can only be created by system administrators. Please contact your administrator
                    to request access to the system.
                  </p>
                </div>
              </div>
              <div className="mt-6 text-center text-sm">
                Already have an account?{" "}
                <Link href="/auth/login" className="underline underline-offset-4 font-medium">
                  Sign in
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
