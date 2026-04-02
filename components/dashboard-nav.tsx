"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { useSidebarContext } from "@/app/dashboard/sidebar-context";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Banknote,
  BarChart3,
  LogOut,
  Menu,
  X,
  Settings,
  Briefcase,
  CreditCard,
  ChevronLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface DashboardNavProps {
  profile: Profile | null;
}

export function DashboardNav({ profile }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isSidebarCollapsed, setIsSidebarCollapsed } = useSidebarContext();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const supabase = createClient();

    try {
      await supabase.auth.signOut();
      toast({
        variant: "success",
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
      router.push("/auth/login");
      router.refresh();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sign out failed",
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleNavigation = (href: string) => {
    setIsMobileMenuOpen(false);
    startTransition(() => {
      router.push(href);
    });
  };

  const getNavItemsForRole = (role: string | undefined) => {
    const allNavItems = [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["super_admin", "admin"],
      },
      {
        href: "/dashboard/users",
        label: "Team",
        icon: Users,
        roles: ["super_admin", "admin"],
      },
      {
        href: "/dashboard/clients",
        label: "Clients",
        icon: Briefcase,
        roles: ["super_admin", "admin"],
      },
      {
        href: "/dashboard/products",
        label: "Products",
        icon: Package,
        roles: ["super_admin", "admin"],
      },
      {
        href: "/dashboard/operators",
        label: "Operators",
        icon: Users,
        roles: ["super_admin", "admin"],
      },
        {
          href: "/dashboard/operators/invoices",
          label: "Operator Invoices",
          icon: FileText,
          roles: ["super_admin", "admin"],
        },
        {
          href: "/dashboard/operators/payments",
          label: "Operator Payments",
          icon: Banknote,
          roles: ["super_admin", "admin"],
        },
      {
        href: "/dashboard/client-pricing",
        label: "Pricing Rules",
        icon: CreditCard,
        roles: ["super_admin", "admin"],
      },
      {
        href: "/dashboard/invoices",
        label: "Invoices",
        icon: FileText,
        roles: ["super_admin", "admin", "accountant"],
      },
      {
        href: "/dashboard/quotations",
        label: "Quotations",
        icon: FileText,
        roles: ["super_admin", "admin", "accountant"],
      },
      {
        href: "/dashboard/payments",
        label: "Payments",
        icon: Banknote,
        roles: ["super_admin", "admin", "accountant"],
      },
      {
        href: "/dashboard/reports",
        label: "Reports",
        icon: BarChart3,
        roles: ["super_admin", "admin"],
      },
      {
        href: "/dashboard/settings",
        label: "Settings",
        icon: Settings,
        roles: ["super_admin", "admin"],
      },
    ];

    return allNavItems.filter((item) =>
      item.roles.includes(role || "accountant"),
    );
  };

  const navItems = getNavItemsForRole(profile?.role);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md"
      >
        {isMobileMenuOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Menu className="h-6 w-6" />
        )}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 flex flex-col transition-all duration-300 lg:h-screen",
          isMobileMenuOpen
            ? "translate-x-0 w-64"
            : "-translate-x-full lg:translate-x-0",
          !isSidebarCollapsed ? "lg:w-64" : "lg:w-20",
        )}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div
            className={cn(
              "flex items-center gap-3 flex-1",
              isSidebarCollapsed && "lg:flex-col lg:items-center lg:gap-2",
            )}
          >
            <Image
              src="/VSN%20Groups%20LOGO.jpeg"
              alt="Billing Management System logo"
              width={132}
              height={132}
              className="h-11 w-11 rounded-lg object-contain shadow-sm flex-shrink-0"
              quality={100}
              priority
            />
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">
                  Invoice Pro
                </h1>
                <p className="text-sm text-slate-500 mt-1 truncate">
                  {profile?.full_name}
                </p>
                <p className="text-xs text-slate-400 capitalize truncate">
                  {profile?.role?.replace("_", " ")}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:flex items-center justify-center p-2 hover:bg-slate-100 rounded-md transition-colors ml-2 flex-shrink-0"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={cn(
                "h-5 w-5 text-slate-600 transition-transform",
                isSidebarCollapsed && "rotate-180",
              )}
            />
          </button>
        </div>

        <nav
          className={cn(
            "flex-1 p-4 space-y-1",
            !isSidebarCollapsed && "overflow-y-auto",
          )}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavigation(item.href);
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative group",
                  isSidebarCollapsed && "lg:justify-center",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
                title={isSidebarCollapsed ? item.label : ""}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!isSidebarCollapsed && <span>{item.label}</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 flex-shrink-0">
          <div className="relative group">
            <Button
              onClick={handleSignOut}
              variant="outline"
              className={cn(
                "bg-transparent transition-all",
                isSidebarCollapsed
                  ? "lg:w-10 lg:h-10 lg:p-0 lg:justify-center w-full"
                  : "w-full justify-start",
              )}
              size="sm"
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {!isSidebarCollapsed && (
                <span className="ml-2">
                  {isSigningOut ? "Signing out..." : "Sign Out"}
                </span>
              )}
            </Button>
            {isSidebarCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 bottom-0">
                Sign Out
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  );
}
