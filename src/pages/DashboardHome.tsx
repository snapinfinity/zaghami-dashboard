import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, FileText, 
  Briefcase, Users, FolderOpen, FileArchive, LayoutGrid,
  LogOut, ChevronRight, ShoppingBag
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import './DashboardHome.css';

export const DashboardHome: React.FC = () => {
  const navigate = useNavigate();

  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const confirmSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const navItems = [
    { title: 'Contact Enquiries', subtitle: 'View and manage customer enquiries', icon: <Mail size={20} />, path: '/messages' },
    { title: 'Quote Requests', subtitle: 'View product quote requests from customers', icon: <ShoppingBag size={20} />, path: '/quotes' },
    { title: 'Blog Management', subtitle: 'Create and manage blog posts', icon: <FileText size={20} />, path: '/blog' },
    { title: 'Project Management', subtitle: 'Manage portfolio projects', icon: <FolderOpen size={20} />, path: '/projects' },
    { title: 'Client Logos', subtitle: 'Manage trusted client logos', icon: <Users size={20} />, path: '/clients' },
    { title: 'Partner Logos', subtitle: 'Manage strategic partner logos', icon: <Briefcase size={20} />, path: '/partners' },
    { title: 'Technical Resources', subtitle: 'Manage product documents', icon: <FileArchive size={20} />, path: '/resources' },
    { title: 'Product Categories', subtitle: 'Manage category names & images (EN + AR)', icon: <LayoutGrid size={20} />, path: '/categories' },
    { title: 'Products', subtitle: 'Manage individual products', icon: <LayoutGrid size={20} />, path: '/products' }
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
            <button className="logout-btn" onClick={() => setShowSignOutModal(true)}>
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
          <header className="dashboard-simple-header" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="header-titles">
              <h1 className="header-title text-gradient">ZAGHAMI Admin</h1>
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
      <AnimatePresence>
        {showSignOutModal && (
          <div className="signout-modal-overlay">
            <motion.div 
              className="signout-modal"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="signout-modal-icon-wrapper">
                <LogOut size={28} className="signout-modal-icon" />
              </div>
              <h3 className="signout-modal-title">Sign Out</h3>
              <p className="signout-modal-desc">Are you sure you want to sign out of the admin dashboard?</p>
              
              <div className="signout-modal-actions">
                <button 
                  className="btn-cancel-signout" 
                  onClick={() => setShowSignOutModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-confirm-signout" 
                  onClick={confirmSignOut}
                >
                  Yes, Sign Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
