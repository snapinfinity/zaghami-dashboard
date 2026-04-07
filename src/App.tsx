import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { DashboardHome } from './pages/DashboardHome';
import { BlogManagement } from './pages/BlogManagement';
import { ContactMessages } from './pages/ContactMessages';
import { ClientManagement } from './pages/ClientManagement';
import { PartnerManagement } from './pages/PartnerManagement';
import { ProjectManagement } from './pages/ProjectManagement';
import { TechnicalResources } from './pages/TechnicalResources';
import { ProductCategories } from './pages/ProductCategories';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
          <Route path="blog" element={<BlogManagement />} />
          <Route path="messages" element={<ContactMessages />} />
          <Route path="clients" element={<ClientManagement />} />
          <Route path="partners" element={<PartnerManagement />} />
          <Route path="projects" element={<ProjectManagement />} />
          <Route path="resources" element={<TechnicalResources />} />
          <Route path="categories" element={<ProductCategories />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
