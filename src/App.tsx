import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { useNotificationNavigator } from "@/hooks/useNotifications";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { BrandingProvider } from "@/hooks/useBranding";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/AdminLayout";
import { ManagerLayout } from "@/components/ManagerLayout";
import { ClientLayout } from "@/components/ClientLayout";
import { PlatformLayout } from "@/components/PlatformLayout";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages
const Login = lazy(() => import("@/pages/Login"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AddFunds = lazy(() => import("@/pages/AddFunds"));
const ClientList = lazy(() => import("@/pages/ClientList"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const NewClient = lazy(() => import("@/pages/NewClient"));
const ClientDashboard = lazy(() => import("@/pages/ClientDashboard"));
const ManagerDashboard = lazy(() => import("@/pages/ManagerDashboard"));
const Settings = lazy(() => import("@/pages/Settings"));
const AdminProfile = lazy(() => import("@/pages/AdminProfile"));
const AuditLogs = lazy(() => import("@/pages/AuditLogs"));
const SyncHealth = lazy(() => import("@/pages/SyncHealth"));
const TeamManagement = lazy(() => import("@/pages/TeamManagement"));
const TeamMemberDetail = lazy(() => import("@/pages/TeamMemberDetail"));
const AdAccounts = lazy(() => import("@/pages/AdAccounts"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const CampaignMapping = lazy(() => import("@/pages/CampaignMapping"));
const WalletInventory = lazy(() => import("@/pages/WalletInventory"));
const FinanceHub = lazy(() => import("@/pages/FinanceHub"));
const PaymentRequests = lazy(() => import("@/pages/PaymentRequests"));
const OrderManagement = lazy(() => import("@/pages/OrderManagement"));
const NewCampaignRequest = lazy(() => import("@/pages/NewCampaignRequest"));
const MyCampaignRequests = lazy(() => import("@/pages/MyCampaignRequests"));
const ClientReports = lazy(() => import("@/pages/ClientReports"));
const ClientWallet = lazy(() => import("@/pages/ClientWallet"));
const AdAccountDetail = lazy(() => import("@/pages/AdAccountDetail"));
const AttentionRequired = lazy(() => import("@/pages/AttentionRequired"));
const ClientNotices = lazy(() => import("@/pages/ClientNotices"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const PlatformDashboard = lazy(() => import("@/pages/PlatformDashboard"));
const AgencyList = lazy(() => import("@/pages/AgencyList"));
const CreateAgency = lazy(() => import("@/pages/CreateAgency"));
const AgencyDetail = lazy(() => import("@/pages/AgencyDetail"));
const PlatformBilling = lazy(() => import("@/pages/PlatformBilling"));
const PlatformPlans = lazy(() => import("@/pages/PlatformPlans"));
const PlatformAnnouncements = lazy(() => import("@/pages/PlatformAnnouncements"));
const PlatformAudit = lazy(() => import("@/pages/PlatformAudit"));
const PlatformHealth = lazy(() => import("@/pages/PlatformHealth"));
const TenantLifecycle = lazy(() => import("@/pages/TenantLifecycle"));
const PlatformRevenue = lazy(() => import("@/pages/PlatformRevenue"));
const TenantUsageMetering = lazy(() => import("@/pages/TenantUsageMetering"));
const PlatformCohorts = lazy(() => import("@/pages/PlatformCohorts"));
const PlatformChurnPrediction = lazy(() => import("@/pages/PlatformChurnPrediction"));
const PlatformFeatureAdoption = lazy(() => import("@/pages/PlatformFeatureAdoption"));
const PlatformForecasting = lazy(() => import("@/pages/PlatformForecasting"));
const PlatformCostAnalytics = lazy(() => import("@/pages/PlatformCostAnalytics"));
const PlatformHealthScores = lazy(() => import("@/pages/PlatformHealthScores"));
const PlatformBenchmarks = lazy(() => import("@/pages/PlatformBenchmarks"));
const AdminSubscription = lazy(() => import("@/pages/AdminSubscription"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60 * 1000,
    },
  },
});

function NotifNavigator() { useNotificationNavigator(); return null; }

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
          <CurrencyProvider>
            <Toaster />
            <Sonner />
            <NotifNavigator />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<LandingPage />} />

                {/* Platform Owner routes */}
                <Route
                  element={
                    <ProtectedRoute requiredRole="platform_owner">
                      <PlatformLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/platform" element={<PlatformDashboard />} />
                  <Route path="/platform/lifecycle" element={<TenantLifecycle />} />
                  <Route path="/platform/revenue" element={<PlatformRevenue />} />
                  <Route path="/platform/usage" element={<TenantUsageMetering />} />
                  <Route path="/platform/agencies" element={<AgencyList />} />
                  <Route path="/platform/agencies/new" element={<CreateAgency />} />
                  <Route path="/platform/agencies/:agencyId" element={<AgencyDetail />} />
                  <Route path="/platform/billing" element={<PlatformBilling />} />
                  <Route path="/platform/plans" element={<PlatformPlans />} />
                  <Route path="/platform/announcements" element={<PlatformAnnouncements />} />
                  <Route path="/platform/audit" element={<PlatformAudit />} />
                  <Route path="/platform/health" element={<PlatformHealth />} />
                  <Route path="/platform/cohorts" element={<PlatformCohorts />} />
                  <Route path="/platform/churn" element={<PlatformChurnPrediction />} />
                  <Route path="/platform/adoption" element={<PlatformFeatureAdoption />} />
                  <Route path="/platform/forecasting" element={<PlatformForecasting />} />
                  <Route path="/platform/costs" element={<PlatformCostAnalytics />} />
                  <Route path="/platform/health-scores" element={<PlatformHealthScores />} />
                  <Route path="/platform/benchmarks" element={<PlatformBenchmarks />} />
                </Route>

                {/* Super Admin routes */}
                <Route
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <AdminLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/attention" element={<AttentionRequired />} />
                  <Route path="/admin/clients" element={<ClientList />} />
                  <Route path="/admin/clients/new" element={<NewClient />} />
                  <Route path="/admin/clients/:userId" element={<ClientDetail />} />
                  <Route path="/admin/add-funds" element={<AddFunds />} />
                  <Route path="/admin/pending" element={<Navigate to="/admin/payment-requests" replace />} />
                  <Route path="/admin/profile" element={<AdminProfile />} />
                  <Route path="/admin/settings" element={<Settings />} />
                  <Route path="/admin/sync-health" element={<SyncHealth />} />
                  <Route path="/admin/logs" element={<AuditLogs />} />
                  <Route path="/admin/team" element={<TeamManagement />} />
                  <Route path="/admin/team/:userId" element={<TeamMemberDetail />} />
                  <Route path="/admin/ad-accounts" element={<AdAccounts />} />
                  <Route path="/admin/ad-accounts/:accountId" element={<AdAccountDetail />} />
                  <Route path="/admin/integrations" element={<Integrations />} />
                  <Route path="/admin/campaigns" element={<CampaignMapping />} />
                  <Route path="/admin/finance" element={<FinanceHub />} />
                  <Route path="/admin/wallet" element={<Navigate to="/admin/finance?tab=wallet" replace />} />
                  <Route path="/admin/expenses" element={<Navigate to="/admin/finance?tab=expenses" replace />} />
                  <Route path="/admin/cash-flow" element={<Navigate to="/admin/finance?tab=cash-flow" replace />} />
                  <Route path="/admin/payment-requests" element={<PaymentRequests />} />
                  <Route path="/admin/orders" element={<OrderManagement />} />
                  <Route path="/admin/client-notices" element={<ClientNotices />} />
                  <Route path="/admin/notifications" element={<Notifications />} />
                  <Route path="/admin/subscription" element={<AdminSubscription />} />
                </Route>

                {/* Manager routes */}
                <Route
                  element={
                    <ProtectedRoute requiredRole="manager">
                      <ManagerLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/manager" element={<ManagerDashboard />} />
                  <Route path="/manager/add-funds" element={<AddFunds />} />
                  <Route path="/manager/notifications" element={<Notifications />} />
                </Route>

                {/* Client routes */}
                <Route
                  element={
                    <ProtectedRoute requiredRole="client">
                      <ClientLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<ClientDashboard />} />
                  <Route path="/dashboard/wallet" element={<ClientWallet />} />
                  <Route path="/dashboard/campaigns" element={<MyCampaignRequests />} />
                  <Route path="/dashboard/campaigns/new" element={<NewCampaignRequest />} />
                  <Route path="/dashboard/reports" element={<ClientReports />} />
                  <Route path="/dashboard/notifications" element={<Notifications />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </CurrencyProvider>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
