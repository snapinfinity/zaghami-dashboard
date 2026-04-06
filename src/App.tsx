import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { DashboardHome } from './pages/DashboardHome';
import { BlogManagement } from './pages/BlogManagement';
import { ContactMessages } from './pages/ContactMessages';
import { ClientManagement } from './pages/ClientManagement';
import { PartnerManagement } from './pages/PartnerManagement';
import { ProjectManagement } from './pages/ProjectManagement';

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
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
