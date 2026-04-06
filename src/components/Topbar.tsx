import React from 'react';
import { Bell, Search, User } from 'lucide-react';
import './Topbar.css';

export const Topbar: React.FC = () => {
  return (
    <header className="topbar glass">
      <div className="search-container">
        <Search className="search-icon" size={18} />
        <input type="text" placeholder="Search across dashboard..." className="search-input" />
      </div>

      <div className="topbar-actions">
        <button className="action-btn">
          <Bell size={20} />
          <span className="badge">3</span>
        </button>
        <div className="user-profile">
          <div className="avatar">
            <User size={18} />
          </div>
          <span className="username">Admin User</span>
        </div>
      </div>
    </header>
  );
};
