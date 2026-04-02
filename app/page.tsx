import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FileText, Users, DollarSign, TrendingUp, ArrowRight, CheckCircle2, Shield, Zap } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/VSN%20Groups%20LOGO.jpeg"
              alt="Billing Management System logo"
              width={108}
              height={108}
              className="h-9 w-9 rounded-md object-contain"
              quality={100}
              priority
            />
            <span className="text-xl font-bold">Invoice Pro</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/login">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-20 md:py-32">
        <div className="flex flex-col items-center text-center gap-8 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
            <Zap className="h-4 w-4" />
            Professional Billing Solution
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-balance bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-900 bg-clip-text text-transparent">
            Billing Management Made Simple
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl text-balance">
            Create professional invoices, track payments, and manage clients all in one place. Built for Indian businesses.
          </p>
          <div className="flex gap-4 flex-wrap justify-center">
            <Button size="lg" className="text-base" asChild>
              <Link href="/auth/login">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
          
          {/* Trust Indicators */}
          <div className="flex flex-wrap gap-6 justify-center items-center mt-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>GST Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <span>Secure & Encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-600" />
              <span>Fast & Reliable</span>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-24">
          <div className="group bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-blue-200 transition-all duration-300">
            <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Smart Invoicing</h3>
            <p className="text-sm text-muted-foreground">
              Create professional invoices with automatic GST calculations and client-specific pricing
            </p>
          </div>

          <div className="group bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-green-200 transition-all duration-300">
            <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Users className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Client Management</h3>
            <p className="text-sm text-muted-foreground">
              Keep all your client information organized with pincode auto-fill and custom pricing rules
            </p>
          </div>

          <div className="group bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-purple-200 transition-all duration-300">
            <div className="h-12 w-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Payment Tracking</h3>
            <p className="text-sm text-muted-foreground">
              Monitor full and partial payments with real-time balance updates in Indian Rupees
            </p>
          </div>

          <div className="group bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-orange-200 transition-all duration-300">
            <div className="h-12 w-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Reports & Analytics</h3>
            <p className="text-sm text-muted-foreground">Get insights into your business with comprehensive reports and printable invoices</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-white">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} Invoice Pro. Professional billing management for Indian businesses.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
