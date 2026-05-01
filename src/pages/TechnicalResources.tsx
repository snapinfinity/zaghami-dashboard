import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, ArrowLeft, X, Loader2, UploadCloud, FileText,
  GripVertical, ArrowUpDown, Check, RotateCcw, Eye
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, onSnapshot, doc, deleteDoc,
  addDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import './TechnicalResources.css';
import { AlertModal, type AlertType } from '../components/AlertModal';

export interface TechnicalResource {
  id: string;
  titleEn: string;
  titleAr: string;
  size: string;
  fileUrl: string;
  order?: number;        // manual sort order; undefined = use createdAt desc
  createdAt?: any;
}

export const TechnicalResources: React.FC = () => {
  const navigate = useNavigate();
  const [resources, setResources] = useState<TechnicalResource[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ titleEn: '', titleAr: '', size: '', fileUrl: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Sort mode
  const [sortMode, setSortMode] = useState(false);
  const [sortedList, setSortedList] = useState<TechnicalResource[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderDirty, setOrderDirty] = useState(false);

  // Drag state refs (no extra dependency)
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

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

  /* ── Firestore listener ────────────────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, 'technical_resources'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: TechnicalResource[] = [];
      snapshot.forEach(d => {
        docs.push({ id: d.id, ...d.data() } as TechnicalResource);
      });

      // Sort: if any resource has an explicit `order`, use that;
      // otherwise fall back to descending createdAt.
      const hasManualOrder = docs.some(d => typeof d.order === 'number');
      if (hasManualOrder) {
        docs.sort((a, b) => {
          const oa = typeof a.order === 'number' ? a.order : 99999;
          const ob = typeof b.order === 'number' ? b.order : 99999;
          return oa - ob;
        });
      } else {
        docs.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
      }

      setResources(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  /* ── Sync sortedList when entering sort mode or resources change ─ */
  useEffect(() => {
    if (sortMode) setSortedList([...resources]);
  }, [sortMode, resources]);

  /* ── Drag handlers ─────────────────────────────────────────────── */
  const onDragStart = (idx: number) => { dragIdx.current = idx; };

  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverIdx.current = idx;
  };

  const onDrop = () => {
    if (dragIdx.current === null || dragOverIdx.current === null) return;
    if (dragIdx.current === dragOverIdx.current) return;
    const updated = [...sortedList];
    const [moved] = updated.splice(dragIdx.current, 1);
    updated.splice(dragOverIdx.current, 0, moved);
    setSortedList(updated);
    setOrderDirty(true);
    dragIdx.current = null;
    dragOverIdx.current = null;
  };

  /* ── Save order to Firestore ───────────────────────────────────── */
  const handleSaveOrder = async () => {
    setIsSavingOrder(true);
    try {
      const batch = writeBatch(db);
      sortedList.forEach((res, idx) => {
        batch.update(doc(db, 'technical_resources', res.id), { order: idx });
      });
      await batch.commit();
      setOrderDirty(false);
      setSortMode(false);
      showAlert('Saved', 'Custom sort order saved.', 'success');
    } catch (err) {
      console.error(err);
      showAlert('Error', 'Failed to save sort order.', 'danger');
    }
    setIsSavingOrder(false);
  };

  /* ── Reset order (back to date desc) ──────────────────────────── */
  const handleResetOrder = async () => {
    setAlertConfig({
      isOpen: true,
      type: 'warning',
      title: 'Reset Sort Order',
      message: 'This will remove the manual order and revert to newest-first sorting. Continue?',
      confirmText: 'Reset',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        setIsSavingOrder(true);
        try {
          const batch = writeBatch(db);
          resources.forEach(res => {
            batch.update(doc(db, 'technical_resources', res.id), { order: null });
          });
          await batch.commit();
          setSortMode(false);
        } catch (err) {
          console.error(err);
          showAlert('Error', 'Failed to reset order.', 'danger');
        }
        setIsSavingOrder(false);
      }
    });
  };

  /* ── File upload ───────────────────────────────────────────────── */
  const startUpload = async (file: File) => {
    setIsUploadingFile(true);
    let computedSize = '';
    if (file.size < 1024 * 1024) {
      computedSize = (file.size / 1024).toFixed(1) + ' KB';
    } else {
      computedSize = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    }
    try {
      const storageRef = ref(storage, `technical_resources/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      uploadTask.on(
        'state_changed',
        null,
        (error) => {
          console.error('Upload failed:', error);
          setIsUploadingFile(false);
          showAlert('Upload Failed', 'File upload failed.', 'danger');
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setFormData(prev => ({ ...prev, fileUrl: downloadURL, size: computedSize }));
          setIsUploadingFile(false);
        }
      );
    } catch (err) {
      console.error(err);
      setIsUploadingFile(false);
      showAlert('Error', 'An error occurred starting the file upload.', 'danger');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const fileName = file.name.toLowerCase();
      const isOfficeFile = fileName.endsWith('.doc') || fileName.endsWith('.docx') || 
                           fileName.endsWith('.xls') || fileName.endsWith('.xlsx');

      if (isOfficeFile) {
        setAlertConfig({
          isOpen: true,
          type: 'warning',
          title: 'Format Compatibility',
          message: 'Word and Excel files typically trigger a download rather than viewing in-browser. Do you want to continue with this file?',
          confirmText: 'Continue Upload',
          showCancel: true,
          onConfirm: () => {
            closeAlert();
            startUpload(file);
          }
        });
      } else {
        startUpload(file);
      }
    }
  };

  /* ── Save new resource ─────────────────────────────────────────── */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fileUrl) {
      showAlert('Missing File', 'Please upload a document file.', 'warning');
      return;
    }
    if (!formData.titleEn || !formData.titleAr) {
      showAlert('Missing Title', 'Please provide both English and Arabic titles.', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'technical_resources'), {
        ...formData,
        createdAt: serverTimestamp()
        // order intentionally omitted → will use date sort by default
      });
      setIsModalOpen(false);
      setFormData({ titleEn: '', titleAr: '', size: '', fileUrl: '' });
      showAlert('Success', 'Resource saved successfully.', 'success');
    } catch (err) {
      console.error('Error saving resource: ', err);
      showAlert('Error', 'Failed to save resource.', 'danger');
    }
    setIsSaving(false);
  };

  /* ── Delete ────────────────────────────────────────────────────── */
  const handleDelete = (id: string, title: string) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Resource',
      message: `Are you sure you want to remove "${title}"? This action cannot be undone.`,
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await deleteDoc(doc(db, 'technical_resources', id));
          showAlert('Deleted', 'Resource has been removed.', 'success');
        } catch (err) {
          console.error('Error deleting resource: ', err);
          showAlert('Error', 'Failed to delete resource.', 'danger');
        }
      }
    });
  };

  const displayList = sortMode ? sortedList : resources;
  const hasManualOrder = resources.some(r => typeof r.order === 'number');

  return (
    <motion.div
      className="resource-section"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <button
        onClick={() => navigate('/')}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '2rem', padding: 0 }}
      >
        <ArrowLeft size={18} />
        <span>Back to Dashboard</span>
      </button>

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="resource-page-header">
        <div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '2rem', marginBottom: '0.5rem' }}>Technical Resources</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage downloadable product catalogs, specifications, and guides.</p>
        </div>

        {/* Sort controls */}
        {!loading && resources.length > 1 && (
          <div className="resource-sort-controls">
            {sortMode ? (
              <>
                {hasManualOrder && (
                  <button
                    className="resource-sort-btn resource-sort-btn--ghost"
                    onClick={handleResetOrder}
                    disabled={isSavingOrder}
                    title="Revert to newest-first"
                  >
                    <RotateCcw size={14} /> Reset to Date
                  </button>
                )}
                <button
                  className="resource-sort-btn resource-sort-btn--cancel"
                  onClick={() => { setSortMode(false); setOrderDirty(false); }}
                  disabled={isSavingOrder}
                >
                  <X size={14} /> Cancel
                </button>
                <button
                  className="resource-sort-btn resource-sort-btn--save"
                  onClick={handleSaveOrder}
                  disabled={!orderDirty || isSavingOrder}
                >
                  {isSavingOrder
                    ? <><Loader2 size={14} className="spin" /> Saving…</>
                    : <><Check size={14} /> Save Order</>}
                </button>
              </>
            ) : (
              <button
                className="resource-sort-btn resource-sort-btn--primary"
                onClick={() => { setSortMode(true); setOrderDirty(false); }}
              >
                <ArrowUpDown size={14} /> Sort Order
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Sort mode banner ─────────────────────────────────────── */}
      <AnimatePresence>
        {sortMode && (
          <motion.div
            className="resource-sort-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <GripVertical size={16} />
            Drag the <strong>grip handle</strong> on the left to reorder. Click <strong>Save Order</strong> when done.
            {hasManualOrder && <span className="resource-sort-badge">Custom order active</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading resources...</div>
      ) : (
        <div className="resource-grid">
          {/* Add card — hidden in sort mode */}
          {!sortMode && (
            <div className="upload-resource-card" onClick={() => setIsModalOpen(true)}>
              <UploadCloud size={40} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: '1.2rem', marginBottom: '0.25rem' }}>Add New Resource</div>
                <div style={{ fontSize: '0.95rem' }}>Upload PDF, DOCX, XLSX</div>
              </div>
            </div>
          )}

          {displayList.map((resource, idx) => (
            <motion.div
              key={resource.id}
              className={`resource-card${sortMode ? ' resource-card--sortable' : ''}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              draggable={sortMode}
              onDragStart={sortMode ? () => onDragStart(idx) : undefined}
              onDragOver={sortMode ? (e) => onDragOver(e, idx) : undefined}
              onDrop={sortMode ? onDrop : undefined}
            >
              {/* Drag handle — only in sort mode */}
              {sortMode && (
                <div className="resource-drag-handle" title="Drag to reorder">
                  <GripVertical size={18} />
                  <span className="resource-order-num">{idx + 1}</span>
                </div>
              )}

              <div className="resource-info">
                <div className="resource-title">{resource.titleEn}</div>
                <div className="resource-meta">
                  <FileText size={14} />
                  <span>{resource.size}</span>
                  <span style={{ margin: '0 0.5rem', color: 'var(--border-color)' }}>|</span>
                  <span style={{ fontSize: '0.85rem' }}>{resource.titleAr}</span>
                  {typeof resource.order === 'number' && !sortMode && (
                    <span className="resource-order-badge">#{resource.order + 1}</span>
                  )}
                </div>
              </div>

              {!sortMode && (
                <div className="resource-actions">
                  <a href={resource.fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>
                    <Eye size={16} />
                    <span>Preview</span>
                  </a>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(resource.id, resource.titleEn)}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Upload Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="resource-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="resource-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="resource-modal-header">
                <h2 className="resource-modal-title">Upload Technical Resource</h2>
                <button className="btn-close" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>Title (English)</label>
                  <input type="text" required placeholder="e.g. Safety Products Catalog 2025" value={formData.titleEn} onChange={e => setFormData({ ...formData, titleEn: e.target.value })} />
                </div>

                <div className="form-group">
                  <label>Title (Arabic)</label>
                  <input type="text" required placeholder="e.g. كتالوج منتجات السلامة 2025" value={formData.titleAr} onChange={e => setFormData({ ...formData, titleAr: e.target.value })} dir="rtl" />
                </div>

                <div className="form-group">
                  <label>Document File</label>
                  <div className="file-upload-box">
                    {isUploadingFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Loader2 size={18} className="spin" color="var(--accent-teal)" style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>Uploading file securely...</span>
                      </div>
                    ) : formData.fileUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                        <FileText size={24} color="var(--accent-teal)" />
                        <span style={{ fontWeight: 500 }}>File Uploaded ({formData.size})</span>
                        <button type="button" onClick={() => setFormData({ ...formData, fileUrl: '', size: '' })} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', marginLeft: '1rem' }}>Remove</button>
                      </div>
                    ) : (
                      <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileUpload} />
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '0.75rem 1.5rem', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={isSaving || isUploadingFile} style={{ padding: '0.75rem 1.5rem', border: 'none', background: 'var(--accent-teal)', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    {isSaving ? 'Saving...' : 'Save Resource'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
