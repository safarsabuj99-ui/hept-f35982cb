import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { useNotificationNavigator } from "@/hooks/useNotifications";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/AdminLayout";
import { ManagerLayout } from "@/components/ManagerLayout";
import { ClientLayout } from "@/components/ClientLayout";
import { PlatformLayout } from "@/components/PlatformLayout";
import Login from "@/pages/Login";
import AdminDashboard from "@/pages/AdminDashboard";
import AddFunds from "@/pages/AddFunds";
import ClientList from "@/pages/ClientList";
import ClientDetail from "@/pages/ClientDetail";
import NewClient from "@/pages/NewClient";
import ClientDashboard from "@/pages/ClientDashboard";
import ManagerDashboard from "@/pages/ManagerDashboard";

import Settings from "@/pages/Settings";
import AdminProfile from "@/pages/AdminProfile";
import AuditLogs from "@/pages/AuditLogs";
import SyncHealth from "@/pages/SyncHealth";

import TeamManagement from "@/pages/TeamManagement";
import TeamMemberDetail from "@/pages/TeamMemberDetail";
import AdAccounts from "@/pages/AdAccounts";
import Integrations from "@/pages/Integrations";
import CampaignMapping from "@/pages/CampaignMapping";

import WalletInventory from "@/pages/WalletInventory";
import FinanceHub from "@/pages/FinanceHub";
import PaymentRequests from "@/pages/PaymentRequests";
import OrderManagement from "@/pages/OrderManagement";
import NewCampaignRequest from "@/pages/NewCampaignRequest";
import MyCampaignRequests from "@/pages/MyCampaignRequests";
import ClientReports from "@/pages/ClientReports";
import ClientWallet from "@/pages/ClientWallet";
import AdAccountDetail from "@/pages/AdAccountDetail";
import AttentionRequired from "@/pages/AttentionRequired";
import ClientNotices from "@/pages/ClientNotices";
import Notifications from "@/pages/Notifications";

import PlatformDashboard from "@/pages/PlatformDashboard";
import AgencyList from "@/pages/AgencyList";
import CreateAgency from "@/pages/CreateAgency";
import AgencyDetail from "@/pages/AgencyDetail";
import PlatformBilling from "@/pages/PlatformBilling";
import PlatformPlans from "@/pages/PlatformPlans";
import PlatformAnnouncements from "@/pages/PlatformAnnouncements";
import PlatformAudit from "@/pages/PlatformAudit";
import PlatformHealth from "@/pages/PlatformHealth";
import TenantLifecycle from "@/pages/TenantLifecycle";
import PlatformRevenue from "@/pages/PlatformRevenue";
import TenantUsageMetering from "@/pages/TenantUsageMetering";
import PlatformCohorts from "@/pages/PlatformCohorts";
import PlatformChurnPrediction from "@/pages/PlatformChurnPrediction";
import PlatformFeatureAdoption from "@/pages/PlatformFeatureAdoption";
import PlatformForecasting from "@/pages/PlatformForecasting";
import PlatformCostAnalytics from "@/pages/PlatformCostAnalytics";
import PlatformHealthScores from "@/pages/PlatformHealthScores";
import PlatformBenchmarks from "@/pages/PlatformBenchmarks";

import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s - serve cached data instantly, revalidate in background
      gcTime: 5 * 60 * 1000, // 5 min garbage collection
    },
  },
});

function NotifNavigator() { useNotificationNavigator(); return null; }

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <CurrencyProvider>
            <Toaster />
            <Sonner />
            <NotifNavigator />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Navigate to="/login" replace />} />

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
          </CurrencyProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
