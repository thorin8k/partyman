import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Router, Route, Switch } from 'wouter';
import { AuthProvider } from './components/AuthContext';
import { Dashboard } from './pages/Dashboard';
import { ParticipantLogin } from './pages/login/ParticipantLogin';
import { AdminLogin } from './pages/login/AdminLogin';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { PartyDetail } from './pages/admin/PartyDetail';
import { PublicDisplay } from './pages/public/PublicDisplay';
import { AdminGames } from './pages/admin/AdminGames';
import { AdminPlanning } from './pages/admin/AdminPlanning';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Switch>
          {/* Public routes */}
          <Route path="/" component={Dashboard} />
          <Route path="/login" component={ParticipantLogin} />
          <Route path="/admin/login" component={AdminLogin} />
          <Route path="/display" component={PublicDisplay} />

          {/* Admin routes */}
          <Route path="/admin/games" component={AdminGames} />
          <Route path="/admin/planning" component={AdminPlanning} />
          <Route path="/admin/parties/:id" component={PartyDetail} />
          <Route path="/admin" component={AdminDashboard} />

          {/* 404 */}
          <Route>
            <div className="container">
              <h1>404 - Página no encontrada</h1>
              <p>La página que buscas no existe.</p>
              <a href="/">Volver al inicio</a>
            </div>
          </Route>
        </Switch>
      </Router>
    </AuthProvider>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
