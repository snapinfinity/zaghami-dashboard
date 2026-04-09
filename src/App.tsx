import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { DashboardLayout } from './components/DashboardLayout';
import { DashboardHome } from './pages/DashboardHome';
import { BlogManagement } from './pages/BlogManagement';
import { ContactMessages } from './pages/ContactMessages';
import { ClientManagement } from './pages/ClientManagement';
import { PartnerManagement } from './pages/PartnerManagement';
import { ProjectManagement } from './pages/ProjectManagement';
import { TechnicalResources } from './pages/TechnicalResources';
import { ProductCategories } from './pages/ProductCategories';
import { ProductManagement } from './pages/ProductManagement';
import { QuoteRequests } from './pages/QuoteRequests';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<DashboardHome />} />
              <Route path="blog" element={<BlogManagement />} />
              <Route path="messages" element={<ContactMessages />} />
              <Route path="clients" element={<ClientManagement />} />
              <Route path="partners" element={<PartnerManagement />} />
              <Route path="projects" element={<ProjectManagement />} />
              <Route path="resources" element={<TechnicalResources />} />
              <Route path="categories" element={<ProductCategories />} />
              <Route path="products" element={<ProductManagement />} />
              <Route path="quotes" element={<QuoteRequests />} />
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
