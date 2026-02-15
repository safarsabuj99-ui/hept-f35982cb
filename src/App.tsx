import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/AdminLayout";
import { ManagerLayout } from "@/components/ManagerLayout";
import { ClientLayout } from "@/components/ClientLayout";
import Login from "@/pages/Login";
import AdminDashboard from "@/pages/AdminDashboard";
import AddFunds from "@/pages/AddFunds";
import ClientList from "@/pages/ClientList";
import ClientDetail from "@/pages/ClientDetail";
import NewClient from "@/pages/NewClient";
import ClientDashboard from "@/pages/ClientDashboard";
import ManagerDashboard from "@/pages/ManagerDashboard";
import PendingApprovals from "@/pages/PendingApprovals";
import Settings from "@/pages/Settings";
import AuditLogs from "@/pages/AuditLogs";
import ClientAssignment from "@/pages/ClientAssignment";
import TeamManagement from "@/pages/TeamManagement";
import AdAccounts from "@/pages/AdAccounts";
import Integrations from "@/pages/Integrations";
import CampaignMapping from "@/pages/CampaignMapping";
import SpendReport from "@/pages/SpendReport";
import WalletInventory from "@/pages/WalletInventory";
import FinanceDashboard from "@/pages/FinanceDashboard";
import ExpenseManager from "@/pages/ExpenseManager";
import PaymentRequests from "@/pages/PaymentRequests";
import OrderManagement from "@/pages/OrderManagement";
import NewCampaignRequest from "@/pages/NewCampaignRequest";
import MyCampaignRequests from "@/pages/MyCampaignRequests";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <CurrencyProvider>
            <Toaster />
            <Sonner />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Navigate to="/login" replace />} />

              {/* Super Admin routes */}
              <Route
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/clients" element={<ClientList />} />
                <Route path="/admin/clients/new" element={<NewClient />} />
                <Route path="/admin/clients/:userId" element={<ClientDetail />} />
                <Route path="/admin/add-funds" element={<AddFunds />} />
                <Route path="/admin/pending" element={<PendingApprovals />} />
                <Route path="/admin/settings" element={<Settings />} />
                <Route path="/admin/logs" element={<AuditLogs />} />
                <Route path="/admin/assign" element={<ClientAssignment />} />
                <Route path="/admin/team" element={<TeamManagement />} />
                <Route path="/admin/ad-accounts" element={<AdAccounts />} />
                <Route path="/admin/integrations" element={<Integrations />} />
                <Route path="/admin/campaigns" element={<CampaignMapping />} />
                <Route path="/admin/spend-report" element={<SpendReport />} />
                <Route path="/admin/wallet" element={<WalletInventory />} />
                <Route path="/admin/finance" element={<FinanceDashboard />} />
                <Route path="/admin/expenses" element={<ExpenseManager />} />
                <Route path="/admin/payment-requests" element={<PaymentRequests />} />
                <Route path="/admin/orders" element={<OrderManagement />} />
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
                <Route path="/dashboard/campaigns" element={<MyCampaignRequests />} />
                <Route path="/dashboard/campaigns/new" element={<NewCampaignRequest />} />
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
