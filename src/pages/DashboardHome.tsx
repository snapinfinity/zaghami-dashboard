import React from 'react';
import { motion } from 'framer-motion';
import { 
  Mail, FileText, 
  Briefcase, Users, FolderOpen, 
  LogOut, ChevronRight 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './DashboardHome.css';

export const DashboardHome: React.FC = () => {
  const navigate = useNavigate();

  const navItems = [
    { title: 'Contact Enquiries', subtitle: 'View and manage customer enquiries', icon: <Mail size={20} />, path: '/messages' },
    { title: 'Blog Management', subtitle: 'Create and manage blog posts', icon: <FileText size={20} />, path: '/blog' },
    { title: 'Projects', subtitle: 'Manage portfolio projects', icon: <FolderOpen size={20} />, path: '/projects' },
    { title: 'Client Logos', subtitle: 'Manage trusted client logos', icon: <Users size={20} />, path: '/clients' },
    { title: 'Partner Logos', subtitle: 'Manage strategic partner logos', icon: <Briefcase size={20} />, path: '/partners' }
  ];

  return (
    <motion.div 
      className="dashboard-home-simple"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button className="logout-btn">
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
          <header className="dashboard-simple-header" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="header-titles">
              <h1 className="header-title text-gradient">Zaghami Admin</h1>
              <p className="header-subtitle">Welcome back. Here is your platform overview.</p>
            </div>
          </header>
        </div>
      </div>

      <div className="nav-grid-container">
        <div className="nav-grid">
          {navItems.map((item, i) => (
            <motion.div 
              key={i} 
              className="nav-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              onClick={() => navigate(item.path)}
            >
              <div className="nav-card-icon">
                {item.icon}
              </div>
              <div className="nav-card-content">
                <h3 className="nav-card-title">{item.title}</h3>
                <p className="nav-card-subtitle">{item.subtitle}</p>
              </div>
              <div className="nav-card-arrow">
                <ChevronRight size={20} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
