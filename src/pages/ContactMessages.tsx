import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Calendar, User, ChevronDown, ChevronUp, Building, Phone, ArrowLeft, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import './ContactMessages.css';
import { AlertModal, type AlertType } from '../components/AlertModal';

type MessageStatus = 'Unresolved' | 'Resolved';
type FilterType = 'All Enquiries' | 'Unresolved' | 'Resolved';

interface Message {
  id: string;
  name: string;
  companyName: string;
  email: string;
  mobileNumber: string;
  date: string;
  message: string;
  isRead: boolean;
  status: MessageStatus;
  createdAt?: any; // Firestore timestamp
}

// Arabic character detection helper
const containsArabic = (text: string) => /[\u0600-\u06FF]/.test(text || '');

export const ContactMessages: React.FC = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('All Enquiries');

  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    type: AlertType;
    title: string;
    message: string;
    confirmText?: string;
    showCancel?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const closeAlert = () => setAlertConfig(prev => ({ ...prev, isOpen: false }));

  const showAlert = (title: string, message: string, type: AlertType = 'info') => {
    setAlertConfig({
      isOpen: true,
      type,
      title,
      message,
      confirmText: 'OK',
      showCancel: false,
      onConfirm: closeAlert
    });
  };

  // Fetch from Firebase
  useEffect(() => {
    const q = query(
      collection(db, 'inquiries'),
      // orderBy('createdAt', 'desc') // Will need index if we order, let's keep it simple for now or assume they have it.
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        let displayDate = data.date || "Unknown Date";
        
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            displayDate = data.createdAt.toDate().toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            });
          } else if (typeof data.createdAt === 'string' || typeof data.createdAt === 'number') {
            displayDate = new Date(data.createdAt).toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            });
          }
        }

        let parsedStatus: MessageStatus = 'Unresolved';
        if (typeof data.status === 'string') {
          const lowerStatus = data.status.toLowerCase();
          if (lowerStatus === 'resolved' || lowerStatus === 'read') {
             parsedStatus = 'Resolved';
          } else if (lowerStatus === 'unresolved' || lowerStatus === 'unread' || lowerStatus === 'new') {
             parsedStatus = 'Unresolved';
          } else {
             // Fallback for any other string
             parsedStatus = 'Unresolved';
          }
        }

        msgs.push({ 
          id: doc.id, 
          ...data,
          status: parsedStatus,
          isRead: !!data.isRead,
          date: displayDate
        } as Message);
      });
      // Sort in memory to avoid needing complex Firestore indexes immediately
      msgs.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });
      setMessages(msgs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching enquiries: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const toggleExpand = async (id: string, isRead: boolean) => {
    setExpandedId(expandedId === id ? null : id);
    if (expandedId !== id && !isRead) {
      // Mark as read in Firestore
      try {
        const msgRef = doc(db, 'inquiries', id);
        await updateDoc(msgRef, { isRead: true });
      } catch (err) {
        console.error("Could not update isRead status", err);
      }
    }
  };

  const toggleStatus = async (id: string, currentStatus: MessageStatus) => {
    const newStatus = currentStatus === 'Resolved' ? 'Unresolved' : 'Resolved';
    try {
      const msgRef = doc(db, 'inquiries', id);
      await updateDoc(msgRef, { status: newStatus });
    } catch (err) {
      console.error("Could not update status", err);
    }
  };

  const handleDelete = (id: string) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Enquiry',
      message: 'Are you sure you want to delete this enquiry definitively?',
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await deleteDoc(doc(db, 'inquiries', id));
          showAlert("Deleted", "Enquiry has been removed.", "success");
        } catch (err) {
          console.error("Could not delete message", err);
          showAlert("Error", "Could not delete message.", "danger");
        }
      }
    });
  };

  const filteredMessages = messages.filter(msg => {
    if (filter === 'All Enquiries') return true;
    return msg.status === filter;
  });

  return (
    <motion.div 
      className="contact-messages max-w-content"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ padding: '3rem 2rem', maxWidth: '1200px', margin: '0 auto' }}
    >
      <button 
        onClick={() => navigate('/')} 
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '2rem', padding: 0 }}
      >
        <ArrowLeft size={18} />
        <span>Back to Dashboard</span>
      </button>

      <header className="page-header" style={{ marginBottom: '2.5rem' }}>
        <div>
          <h1 className="header-title" style={{ color: 'var(--text-primary)', fontSize: '2rem', marginBottom: '0.5rem' }}>Contact Enquiries</h1>
          <p className="page-subtitle">View submissions directly synced from the Zaghami website.</p>
        </div>
      </header>

      <div className="table-controls panel" style={{ display: 'flex', padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
        <div className="tabs-container">
          {(['All Enquiries', 'Unresolved', 'Resolved'] as FilterType[]).map((f) => (
            <button 
              key={f}
              className={`tab-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="messages-list">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', padding: '1rem 0' }}>
            <div className="message-card panel" style={{ width: '100%', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}>
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                style={{ marginBottom: '1rem' }}
              >
                <Loader2 size={36} color="var(--accent-teal)" />
              </motion.div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: 500, animation: 'shimmerPulse 1.5s ease-in-out infinite' }}>
                Loading enquiries...
              </div>
            </div>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
            No enquiries found in this category.
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isMsgArabic = containsArabic(msg.message);
            const isNameArabic = containsArabic(msg.name);
            
            return (
              <motion.div 
                key={msg.id} 
                className={`message-card panel ${msg.isRead ? 'read' : 'unread'}`}
                layout
              >
                <div className="message-header" onClick={() => toggleExpand(msg.id, msg.isRead)}>
                  <div className="message-info-col">
                    <div className="message-sender-preview" style={isNameArabic ? { direction: 'rtl', gap: '0.5rem' } : undefined}>
                      <div className={`unread-dot ${msg.isRead ? 'hidden' : ''}`} style={isNameArabic ? {right: '-14px', left: 'auto'} : undefined}></div>
                      <User size={18} className="text-secondary" />
                      <span className="sender-name">{msg.name}</span>
                      <span className="text-secondary" style={isNameArabic ? { marginRight: '0.25rem' } : { marginLeft: '0.25rem' }}>({msg.companyName})</span>
                      
                      {msg.status === 'Resolved' && (
                        <span className="status-badge resolved" style={{ marginLeft: isNameArabic ? '0' : '0.75rem', marginRight: isNameArabic ? '0.75rem' : '0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-success)', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                          <CheckCircle size={12} /> Resolved
                        </span>
                      )}
                      {msg.status === 'Unresolved' && (
                        <span className="status-badge unresolved" style={{ marginLeft: isNameArabic ? '0' : '0.75rem', marginRight: isNameArabic ? '0.75rem' : '0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-warning)', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                          <Clock size={12} /> Unresolved
                        </span>
                      )}
                    </div>
                    <h3 className="message-subject-preview" style={isMsgArabic ? { direction: 'rtl', textAlign: 'right', marginTop: '0.5rem', fontFamily: 'Arial, sans-serif' } : undefined}>
                      {msg.message?.length > 60 ? `${msg.message.substring(0, 60)}...` : msg.message}
                    </h3>
                  </div>
                  <div className="message-meta-col">
                    <span className="message-date">{msg.date}</span>
                    <button className="expand-btn">
                      {expandedId === msg.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedId === msg.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="message-body"
                      style={{ backgroundColor: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-color)' }}
                    >
                      <div className="message-details" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', padding: '1.5rem 1.5rem 0' }}>
                        <div className="detail-item">
                          <Mail size={16} className="text-secondary" />
                          <a href={`mailto:${msg.email}`} className="text-link">{msg.email}</a>
                        </div>
                        <div className="detail-item">
                          <Phone size={16} className="text-secondary" />
                          <a href={`tel:${msg.mobileNumber}`} className="text-link" style={{ color: 'var(--text-primary)' }}>{msg.mobileNumber}</a>
                        </div>
                        <div className="detail-item">
                          <Building size={16} className="text-secondary" />
                          <span>{msg.companyName}</span>
                        </div>
                        <div className="detail-item">
                          <Calendar size={16} className="text-secondary" />
                          <span>{msg.date}</span>
                        </div>
                      </div>
                      <div className="message-content-text" style={isMsgArabic ? { direction: 'rtl', textAlign: 'right', fontSize: '1.05rem', fontFamily: 'Arial, sans-serif' } : undefined}>
                        <p>{msg.message}</p>
                      </div>
                      <div className="message-actions" style={{ padding: '0 1.5rem 1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <a 
                            href={`mailto:${msg.email}?subject=Regarding your inquiry — Zaghami`} 
                            className="btn btn-primary"
                          >
                            Reply via Email
                          </a>
                          <button className="btn btn-secondary" onClick={() => toggleStatus(msg.id, msg.status)}>
                            Mark as {msg.status === 'Resolved' ? 'Unresolved' : 'Resolved'}
                          </button>
                        </div>
                        <button className="btn btn-danger" onClick={() => handleDelete(msg.id)}>Delete</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      <AlertModal 
        isOpen={alertConfig.isOpen}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText={alertConfig.confirmText}
        showCancel={alertConfig.showCancel}
        onConfirm={alertConfig.onConfirm}
        onCancel={closeAlert}
      />
    </motion.div>
  );
};

