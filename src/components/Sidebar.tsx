import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, MessageSquare, Settings, LogOut, FileArchive, FolderOpen } from 'lucide-react';
import './Sidebar.css';

export const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar glass">
      <div className="sidebar-header">
        <h2 className="brand-logo">ZAGHAMI</h2>
        <span className="brand-subtitle">Dashboard v1.0</span>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
              <LayoutDashboard size={20} />
              <span>Overview</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/blog" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <FileText size={20} />
              <span>Blog Management</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/messages" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MessageSquare size={20} />
              <span>Contact Messages</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/projects" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <FolderOpen size={20} />
              <span>Projects</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/resources" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <FileArchive size={20} />
              <span>Technical Resources</span>
            </NavLink>
          </li>
        </ul>

        <div className="sidebar-divider"></div>

        <ul className="nav-list">
          <li className="nav-item">
            <a href="#" className="nav-link">
              <Settings size={20} />
              <span>Settings</span>
            </a>
          </li>
          <li className="nav-item">
            <a href="#" className="nav-link logout">
              <LogOut size={20} />
              <span>Log out</span>
            </a>
          </li>
        </ul>
      </nav>
    </aside>
  );
};
