import React from "react";

import {
  Activity,
  AlertTriangle,
  Banknote,
  BookOpen,
  Brain,
  ChartBar,
  Database,
  Fingerprint,
  FlaskConical,
  Info,
  Gauge,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  MessageSquare,
  RefreshCw,
  SquareArrowUpRight,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";

import { OwlIcon } from "@/components/icons/owl-icon";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon | React.FC<React.SVGProps<SVGSVGElement>>;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon | React.FC<React.SVGProps<SVGSVGElement>>;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard/default",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: 2,
    label: "Churn Intelligence",
    items: [
      {
        title: "Churn Predictions",
        url: "/dashboard/churn",
        icon: AlertTriangle,
      },
      {
        title: "Customer Segments",
        url: "/dashboard/segments",
        icon: Users,
      },
      {
        title: "Social Sentiment",
        url: "/dashboard/sentiment",
        icon: MessageSquare,
        isNew: true,
      },
      {
        title: "Customer List",
        url: "/dashboard/customer-list",
        icon: FlaskConical,
        isNew: true,
      },
    ],
  },

  {
    id: 3,
    label: "Retention Action",
    items: [
      {
        title: "Campaign Hub",
        url: "/dashboard/retention",
        icon: RefreshCw,
      },
      {
        title: "Retention Testing",
        url: "/dashboard/retention-testing",
        icon: FlaskConical,
        isNew: true,
      },
    ],
  },

  {
    id: 4,
    label: "AI Assistant",
    items: [
      {
        title: "WiseAI",
        url: "/dashboard/ai-analyst",
        icon: OwlIcon,
        isNew: true,
      },
    ],
  },
  {
    id: 5,
    items: [
      {
        title: "Documentation",
        url: "/dashboard/docs",
        icon: BookOpen,
      },
      {
        title: "About",
        url: "/dashboard/about",
        icon: Info,
      },
    ],
  },
  {
    id: 6,
    label: "Legacy",
    items: [
      {
        title: "Dashboards",
        url: "/dashboard/default-v1",
        subItems: [
          { title: "Default V1", url: "/dashboard/default-v1" },
          { title: "CRM V1", url: "/dashboard/crm-v1" },
          { title: "Finance V1", url: "/dashboard/finance-v1" },
          { title: "CRM", url: "/dashboard/crm" },
          { title: "Finance", url: "/dashboard/finance" },
          { title: "Analytics", url: "/dashboard/analytics" },
          { title: "Productivity", url: "/dashboard/productivity" },
        ],
      },
      {
        title: "Authentication",
        url: "/auth",
        subItems: [
          { title: "Login v1", url: "/auth/v1/login", newTab: true },
          { title: "Login v2", url: "/auth/v2/login", newTab: true },
          { title: "Register v1", url: "/auth/v1/register", newTab: true },
          { title: "Register v2", url: "/auth/v2/register", newTab: true },
        ],
      },
    ],
  },
];
