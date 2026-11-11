import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import DeliveriesPage from '@/pages/deliveries';
import OrdersPage from '@/pages/orders';
import UtilisationPage from '@/pages/utilisation';
import AviationFinancePage from '@/pages/aviation-finance';
import MarketRatesPage from "@/pages/market-rates";
import EmissionsPage from "@/pages/emissions";
import RegistryPage from "@/pages/registry";
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

if (typeof document !== 'undefined' && localStorage.getItem('ae-theme') !== 'light') {
  document.documentElement.classList.add('dark');
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
});

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={DeliveriesPage} />
        <Route path="/deliveries" component={DeliveriesPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/aircraft-utilisation" component={UtilisationPage} />
        <Route path="/aviation-finance" component={AviationFinancePage} />
        <Route path="/market-value-lease-rates" component={MarketRatesPage} />
        <Route path="/emissions" component={EmissionsPage} />
        <Route path="/aircraft-registry" component={RegistryPage} />
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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
