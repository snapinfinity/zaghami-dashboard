import React from 'react';
import { Outlet } from 'react-router-dom';
import './DashboardLayout.css';

export const DashboardLayout: React.FC = () => {
  return (
    <div className="dashboard-layout">
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};
