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

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
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
        comingSoon: true,
      },
      {
        title: "Customer Segments",
        url: "/dashboard/segments",
        icon: Users,
        comingSoon: true,
      },
      {
        title: "Retention Actions",
        url: "/dashboard/retention",
        icon: RefreshCw,
        comingSoon: true,
      },
      {
        title: "Social Sentiment",
        url: "/dashboard/sentiment",
        icon: MessageSquare,
        isNew: true,
        comingSoon: true,
      },
      {
        title: "Retention Testing",
        url: "/dashboard/retention-testing",
        icon: FlaskConical,
        isNew: true,
        comingSoon: true,
      },
    ],
  },
  {
    id: 3,
    label: "ML Pipeline",
    items: [
      {
        title: "Model Registry",
        url: "/dashboard/models",
        icon: Brain,
        comingSoon: true,
      },
      {
        title: "Experiments",
        url: "/dashboard/experiments",
        icon: FlaskConical,
        comingSoon: true,
      },
      {
        title: "Drift Monitoring",
        url: "/dashboard/drift",
        icon: Activity,
        isNew: true,
        comingSoon: true,
      },
      {
        title: "Pipeline Status",
        url: "/dashboard/pipeline",
        icon: Zap,
        comingSoon: true,
      },
    ],
  },
  {
    id: 4,
    label: "Data",
    items: [
      {
        title: "Data Warehouse",
        url: "/dashboard/warehouse",
        icon: Database,
        comingSoon: true,
      },
      {
        title: "Data Quality",
        url: "/dashboard/data-quality",
        icon: ShieldCheck,
        comingSoon: true,
      },
    ],
  },
  {
    id: 5,
    label: "AI Assistant",
    items: [
      {
        title: "WiseAI",
        url: "/dashboard/analyst",
        icon: Brain,
        isNew: true,
        comingSoon: true,
      },
    ],
  },
  {
    id: 6,
    items: [
      {
        title: "Documentation",
        url: "/dashboard/docs",
        icon: BookOpen,
        comingSoon: true,
      },
      {
        title: "About",
        url: "/dashboard/about",
        icon: Info,
        comingSoon: true,
      },
    ],
  },
  {
    id: 7,
    label: "Legacy",
    items: [
      {
        title: "Dashboards",
        url: "/dashboard/default-v1",
        subItems: [
          { title: "Default V1", url: "/dashboard/default-v1" },
          { title: "CRM V1", url: "/dashboard/crm-v1" },
          { title: "Finance V1", url: "/dashboard/finance-v1" },
        ],
      },
      {
        title: "Authentication",
        url: "/auth",
        icon: Fingerprint,
        subItems: [
          { title: "Login v1", url: "/auth/v1/login", newTab: true },
          { title: "Login v2", url: "/auth/v2/login", newTab: true },
          { title: "Register v1", url: "/auth/v1/register", newTab: true },
          { title: "Register v2", url: "/auth/v2/register", newTab: true },
        ],
      },
      {
        title: "CRM",
        url: "/dashboard/crm",
        icon: ChartBar,
      },
      {
        title: "Finance",
        url: "/dashboard/finance",
        icon: Banknote,
      },
      {
        title: "Analytics",
        url: "/dashboard/analytics",
        icon: Gauge,
      },
      {
        title: "Productivity",
        url: "/dashboard/productivity",
        icon: ListTodo,
      },
    ],
  },
];
