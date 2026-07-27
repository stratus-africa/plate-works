import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Moon, Search, Sun, User2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/use-theme";
import { ROLE_LABELS, useAuth } from "@/lib/auth";
import { GlobalSearch } from "./global-search";

const CRUMBS: Record<string, string> = {
  dashboard: "Dashboard",
  inventory: "Plate Batches",
  receive: "Receive Stock",
  plates: "Plates",
  offcuts: "Offcuts",
  jobs: "Jobs",
  new: "New Job",
  customers: "Customers",
  reports: "Reports",
  settings: "Settings",
  notifications: "Notifications",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { user, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const segments = pathname.split("/").filter(Boolean);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur">
            <SidebarTrigger />
            <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
              <Link to="/dashboard" className="hover:text-foreground">
                Home
              </Link>
              {segments.map((seg) => (
                <span key={seg} className="flex items-center gap-1">
                  <span>/</span>
                  <span className="text-foreground">{CRUMBS[seg] ?? seg}</span>
                </span>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="hidden rounded border px-1 text-[10px] sm:inline">Ctrl K</kbd>
              </Button>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account">
                    <User2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="space-y-1">
                    <p className="truncate text-sm">{user?.email}</p>
                    <div className="flex flex-wrap gap-1">
                      {roles.map((r) => (
                        <Badge key={r} variant="secondary" className="text-[10px]">
                          {ROLE_LABELS[r]}
                        </Badge>
                      ))}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
  );
}
