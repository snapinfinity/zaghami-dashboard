import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, Calendar, User, ChevronDown, ChevronUp,
  Building, Phone, Mail, ArrowLeft, CheckCircle, Clock,
  Loader2, Package, Hash, Trash2, FileText, Globe, Briefcase
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import './QuoteRequests.css';
import { AlertModal, type AlertType } from '../components/AlertModal';

type QuoteStatus = 'Pending' | 'Reviewed' | 'Fulfilled';
type FilterType = 'All' | 'Pending' | 'Reviewed' | 'Fulfilled';

interface QuoteItem {
  id: string;
  nameEn: string;
  nameAr?: string;
  category?: string;
  image?: string;
  quantity: number;
  price?: number;
  descriptionEn?: string;
}

interface CustomerInfo {
  fullName: string;
  email: string;
  phoneNumber?: string;
  companyName?: string;
  country?: string;
  jobTitle?: string;
  quantityInfo?: string;
  unitOfMeasurement?: string;
}

interface QuoteRequest {
  id: string;
  customer: CustomerInfo;
  items: QuoteItem[];
  totalItems: number;
  status: QuoteStatus;
  isNew: boolean;
  createdAt?: any;
  displayDate: string;
}

/* ── Helpers ──────────────────────────────────────────────── */
const formatDate = (createdAt: any): string => {
  if (!createdAt) return 'Unknown Date';
  try {
    const d = typeof createdAt.toDate === 'function' ? createdAt.toDate() : new Date(createdAt);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return 'Unknown Date';
  }
};

const parseStatus = (raw: any): QuoteStatus => {
  if (typeof raw !== 'string') return 'Pending';
  const lower = raw.toLowerCase();
  if (lower === 'reviewed') return 'Reviewed';
  if (lower === 'fulfilled') return 'Fulfilled';
  // 'new' and anything else → Pending
  return 'Pending';
};

const STATUS_CONFIG: Record<QuoteStatus, { label: string; icon: React.ReactNode; colorClass: string }> = {
  Pending:  { label: 'Pending',  icon: <Clock size={12} />,       colorClass: 'status-pending'  },
  Reviewed: { label: 'Reviewed', icon: <CheckCircle size={12} />, colorClass: 'status-reviewed' },
  Fulfilled:{ label: 'Fulfilled',icon: <CheckCircle size={12} />, colorClass: 'status-fulfilled'},
};

/* ── Component ────────────────────────────────────────────── */
export const QuoteRequests: React.FC = () => {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('All');

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

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'quote_requests')),
      (snapshot) => {
        const items: QuoteRequest[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();

          // ── customerInfo map ──────────────────────────────
          const ci = data.customerInfo || {};
          const customer: CustomerInfo = {
            fullName:         ci.fullName        || data.name || 'Unknown',
            email:            ci.email           || data.email || '',
            phoneNumber:      ci.phoneNumber     || data.phone || data.mobileNumber || '',
            companyName:      ci.companyName     || data.companyName || '',
            country:          ci.country         || '',
            jobTitle:         ci.jobTitle        || '',
            quantityInfo:     ci.quantityInfo    || '',
            unitOfMeasurement:ci.unitOfMeasurement || '',
          };

          // ── items array ───────────────────────────────────
          const rawItems: any[] = Array.isArray(data.items)
            ? data.items
            : Array.isArray(data.cartItems)
              ? data.cartItems
              : [];

          const quoteItems: QuoteItem[] = rawItems.map((it: any) => ({
            id:           it.id         || it.productId   || '',
            nameEn:       it.nameEn     || it.productName || it.name || 'Unknown Product',
            nameAr:       it.nameAr     || '',
            category:     it.category   || '',
            image:        it.image      || '',
            quantity:     Number(it.quantity) || 1,
            price:        Number(it.price)    || 0,
            descriptionEn:it.descriptionEn   || '',
          }));

          const totalItems = quoteItems.reduce((s, i) => s + i.quantity, 0);

          items.push({
            id:          docSnap.id,
            customer,
            items:       quoteItems,
            totalItems,
            status:      parseStatus(data.status),
            isNew:       !data.isRead,
            createdAt:   data.createdAt,
            displayDate: formatDate(data.createdAt),
          });
        });

        // Sort newest first
        items.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          const aMs = typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
          const bMs = typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
          return bMs - aMs;
        });

        setQuotes(items);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching quote_requests:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const toggleExpand = async (id: string, isNew: boolean) => {
    setExpandedId(prev => (prev === id ? null : id));
    if (expandedId !== id && isNew) {
      try { await updateDoc(doc(db, 'quote_requests', id), { isRead: true }); }
      catch (err) { console.error('Could not mark as read:', err); }
    }
  };

  const cycleStatus = async (id: string, current: QuoteStatus) => {
    const cycle: QuoteStatus[] = ['Pending', 'Reviewed', 'Fulfilled'];
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    try { await updateDoc(doc(db, 'quote_requests', id), { status: next }); }
    catch (err) { console.error('Could not update status:', err); }
  };

  const handleDelete = (id: string) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Quote Request',
      message: 'Are you sure you want to permanently delete this quote request?',
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await deleteDoc(doc(db, 'quote_requests', id));
          if (expandedId === id) setExpandedId(null);
          showAlert('Deleted', 'Quote request has been permanently deleted.', 'success');
        } catch (err) {
          console.error('Could not delete:', err);
          showAlert('Error', 'Failed to delete quote request.', 'danger');
        }
      }
    });
  };

  const filtered = quotes.filter(q => filter === 'All' || q.status === filter);
  const counts = {
    All:       quotes.length,
    Pending:   quotes.filter(q => q.status === 'Pending').length,
    Reviewed:  quotes.filter(q => q.status === 'Reviewed').length,
    Fulfilled: quotes.filter(q => q.status === 'Fulfilled').length,
  };

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <motion.div
      className="quote-requests"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ padding: '3rem 2rem', maxWidth: '1200px', margin: '0 auto' }}
    >
      {/* Back */}
      <button onClick={() => navigate('/')} className="back-btn">
        <ArrowLeft size={18} />
        <span>Back to Dashboard</span>
      </button>

      {/* Header */}
      <header className="page-header" style={{ marginBottom: '2.5rem' }}>
        <div className="header-icon-wrap">
          <ShoppingCart size={28} />
        </div>
        <div>
          <h1 className="header-title">Quote Requests</h1>
          <p className="page-subtitle">
            Product quote submissions from the Zaghami website — {quotes.length} total request{quotes.length !== 1 ? 's' : ''}.
          </p>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="panel table-controls" style={{ display: 'flex', padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
        <div className="tabs-container">
          {(['All', 'Pending', 'Reviewed', 'Fulfilled'] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`tab-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
              <span className="tab-count">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="quotes-list">
        {loading ? (
          <div className="panel" style={{ padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} style={{ marginBottom: '1rem' }}>
              <Loader2 size={36} color="var(--accent-teal)" />
            </motion.div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>Loading quote requests…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state panel">
            <FileText size={40} />
            <p>No quote requests found{filter !== 'All' ? ` with status "${filter}"` : ''}.</p>
          </div>
        ) : (
          filtered.map((quote) => {
            const cfg = STATUS_CONFIG[quote.status];
            const isOpen = expandedId === quote.id;

            return (
              <motion.div
                key={quote.id}
                className={`quote-card panel ${quote.isNew ? 'is-new' : ''}`}
                layout
              >
                {/* Card Header */}
                <div className="quote-header" onClick={() => toggleExpand(quote.id, quote.isNew)}>
                  <div className="quote-info-col">
                    <div className="quote-sender-row">
                      {quote.isNew && <span className="new-dot" />}
                      <User size={17} className="icon-secondary" />
                      <span className="sender-name">{quote.customer.fullName}</span>
                      {quote.customer.companyName && (
                        <span className="company-name">({quote.customer.companyName})</span>
                      )}
                      <span className={`status-chip ${cfg.colorClass}`}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </div>

                    <div className="quote-preview-row">
                      <Package size={15} className="icon-secondary" />
                      <span className="preview-text">
                        {quote.totalItems} item{quote.totalItems !== 1 ? 's' : ''} requested
                        {quote.items.length > 0 && (
                          ` — ${quote.items.slice(0, 2).map(i => i.nameEn).join(', ')}${quote.items.length > 2 ? ` +${quote.items.length - 2} more` : ''}`
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="quote-meta-col">
                    <span className="quote-date">
                      <Calendar size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      {quote.displayDate}
                    </span>
                    <button className="expand-btn">
                      {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Body */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="quote-body"
                    >
                      {/* Contact Details */}
                      <div className="quote-details-grid">
                        {quote.customer.email && (
                          <div className="detail-item">
                            <Mail size={15} className="icon-secondary" />
                            <a href={`mailto:${quote.customer.email}`} className="text-link">{quote.customer.email}</a>
                          </div>
                        )}
                        {quote.customer.phoneNumber && (
                          <div className="detail-item">
                            <Phone size={15} className="icon-secondary" />
                            <a href={`tel:${quote.customer.phoneNumber}`} className="text-link" style={{ color: 'var(--text-primary)' }}>
                              {quote.customer.phoneNumber}
                            </a>
                          </div>
                        )}
                        {quote.customer.companyName && (
                          <div className="detail-item">
                            <Building size={15} className="icon-secondary" />
                            <span>{quote.customer.companyName}</span>
                          </div>
                        )}
                        {quote.customer.jobTitle && (
                          <div className="detail-item">
                            <Briefcase size={15} className="icon-secondary" />
                            <span>{quote.customer.jobTitle}</span>
                          </div>
                        )}
                        {quote.customer.country && (
                          <div className="detail-item">
                            <Globe size={15} className="icon-secondary" />
                            <span>{quote.customer.country}</span>
                          </div>
                        )}
                        {quote.customer.quantityInfo && (
                          <div className="detail-item">
                            <Package size={15} className="icon-secondary" />
                            <span>Qty info: {quote.customer.quantityInfo} {quote.customer.unitOfMeasurement}</span>
                          </div>
                        )}
                        <div className="detail-item">
                          <Calendar size={15} className="icon-secondary" />
                          <span>{quote.displayDate}</span>
                        </div>
                      </div>

                      {/* Products Table */}
                      {quote.items.length > 0 && (
                        <div className="cart-items-section">
                          <h4 className="section-label">
                            <ShoppingCart size={15} />
                            Requested Products
                          </h4>
                          <div className="cart-table">
                            <div className="cart-table-header">
                              <span>Product</span>
                              <span>Category</span>
                              <span className="qty-col">Qty</span>
                            </div>
                            {quote.items.map((item, idx) => (
                              <div key={`${item.id}-${idx}`} className="cart-table-row">
                                <div className="cart-product-name">
                                  {item.image && (
                                    <img src={item.image} alt={item.nameEn} className="cart-thumb" />
                                  )}
                                  <div className="cart-product-info">
                                    <span className="product-name">{item.nameEn}</span>
                                    <span className="product-id">
                                      <Hash size={10} />
                                      {item.id}
                                    </span>
                                  </div>
                                </div>
                                <span className="cart-category">{item.category || '—'}</span>
                                <span className="cart-qty qty-col">{item.quantity}</span>
                              </div>
                            ))}
                            <div className="cart-table-footer">
                              <span>Total Quantity</span>
                              <span></span>
                              <span className="qty-col total-qty">{quote.totalItems}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="quote-actions">
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          {quote.customer.email && (
                            <button
                              className="btn btn-primary"
                              onClick={() => window.location.href = `mailto:${quote.customer.email}`}
                            >
                              <Mail size={15} />
                              Reply via Email
                            </button>
                          )}
                          <button
                            className="btn btn-secondary"
                            onClick={() => cycleStatus(quote.id, quote.status)}
                          >
                            <CheckCircle size={15} />
                            Mark as {quote.status === 'Pending' ? 'Reviewed' : quote.status === 'Reviewed' ? 'Fulfilled' : 'Pending'}
                          </button>
                        </div>
                        <button className="btn btn-danger" onClick={() => handleDelete(quote.id)}>
                          <Trash2 size={15} />
                          Delete
                        </button>
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
