import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Boxes,
  Layers,
  Scissors,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  PackagePlus,
  Bell,
  ScanLine,
  ArrowRightLeft,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Inventory",
    items: [
      { title: "Plate Batches", url: "/inventory", icon: Boxes },
      { title: "Receive Stock", url: "/inventory/receive", icon: PackagePlus },
      { title: "Plates", url: "/plates", icon: Layers },
      { title: "Offcuts", url: "/offcuts", icon: Scissors },
      { title: "Scan & Consume", url: "/scan", icon: ScanLine },
      { title: "Transfers", url: "/inventory/transfer", icon: ArrowRightLeft },
    ],

  },
  {
    label: "Production",
    items: [
      { title: "Jobs", url: "/jobs", icon: ClipboardList },
      { title: "Customers", url: "/customers", icon: Users },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Reports", url: "/reports", icon: BarChart3 },
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-sidebar-primary text-sidebar-primary-foreground">
            <Layers className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold uppercase tracking-wide text-sidebar-foreground">
                PlateWorks
              </p>
              <p className="text-[11px] text-sidebar-foreground/60">Production Control</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
