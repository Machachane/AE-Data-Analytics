import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AssistantChat } from '@/components/assistant-chat';
import { AssistantControllerProvider } from '@/lib/assistant-controller';
import { TeamAccess } from '@/components/team-access';
import NotFound from '@/pages/not-found';
import DeliveriesPage from '@/pages/deliveries';
import OrdersPage from '@/pages/orders';
import UtilisationPage from '@/pages/utilisation';
import AviationFinancePage from '@/pages/aviation-finance';
import MarketRatesPage from "@/pages/market-rates";
import EmissionsPage from "@/pages/emissions";
import RegistryPage from "@/pages/registry";
import EngineProfilePage from "@/pages/engine-profile";
import JurisdictionRiskPage from "@/pages/jurisdiction-risk";
import AirlineFinancialsPage from "@/pages/airline-financials";
import SummaryPage from "@/pages/summary";
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

// Retire saved appearance preferences and keep already-open sessions dark too.
document.documentElement.classList.remove('light');
document.documentElement.classList.add('dark');
document.documentElement.style.colorScheme = 'dark';
try { localStorage.removeItem('ae-theme'); } catch { /* Browser storage can be unavailable. */ }

const handleAuthError = (error: unknown) => {
  if ((error as { status?: number })?.status === 401) window.dispatchEvent(new Event('ae-auth-expired'));
};
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
});

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={SummaryPage} />
        <Route path="/summary" component={SummaryPage} />
        <Route path="/deliveries" component={DeliveriesPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/aircraft-utilisation" component={UtilisationPage} />
        <Route path="/aviation-finance" component={AviationFinancePage} />
        <Route path="/market-value-lease-rates" component={MarketRatesPage} />
        <Route path="/emissions" component={EmissionsPage} />
        <Route path="/aircraft-registry" component={RegistryPage} />
        <Route path="/engine-profile" component={EngineProfilePage} />
        <Route path="/jurisdiction-risk" component={JurisdictionRiskPage} />
        <Route path="/airline-financials" component={AirlineFinancialsPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <TeamAccess>
            <AssistantControllerProvider>
              <Router />
              <AssistantChat />
            </AssistantControllerProvider>
          </TeamAccess>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
