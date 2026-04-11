import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, CheckCircle, Trash2, X } from 'lucide-react';
import './AlertModal.css';

export type AlertType = 'info' | 'success' | 'danger' | 'warning';

interface AlertModalProps {
  isOpen: boolean;
  type: AlertType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  showCancel?: boolean;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  type,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  showCancel = true
}) => {
  const getIcon = () => {
    switch (type) {
      case 'danger': return <Trash2 size={28} className="alert-icon danger" />;
      case 'warning': return <AlertTriangle size={28} className="alert-icon warning" />;
      case 'success': return <CheckCircle size={28} className="alert-icon success" />;
      default: return <Info size={28} className="alert-icon info" />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="alert-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div 
            className="alert-modal-content"
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
          >
            <div className="alert-modal-header">
              <div className={`icon-container ${type}`}>
                {getIcon()}
              </div>
              <button className="close-btn" onClick={onCancel}>
                 <X size={20} />
              </button>
            </div>
            
            <div className="alert-modal-body">
              <h3>{title}</h3>
              <p>{message}</p>
            </div>

            <div className="alert-modal-footer">
              {showCancel && (
                <button className="alert-btn cancel" onClick={onCancel}>
                  {cancelText}
                </button>
              )}
              <button className={`alert-btn confirm ${type}`} onClick={onConfirm}>
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
