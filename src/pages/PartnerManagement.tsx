import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, ArrowLeft, X, Loader2, UploadCloud, Globe, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, doc, deleteDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import './ClientManagement.css'; // Re-use the exact same CSS
import { AlertModal, type AlertType } from '../components/AlertModal';

export interface Partner {
  id: string;
  logoUrl: string;
  websiteUrl?: string;
  createdAt?: any;
}

export const PartnerManagement: React.FC = () => {
  const navigate = useNavigate();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ logoUrl: '', websiteUrl: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImg, setIsUploadingImg] = useState(false);

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
    const q = query(collection(db, 'partners'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Partner[] = [];
      snapshot.forEach(d => {
        docs.push({ id: d.id, ...d.data() } as Partner);
      });
      docs.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });
      setPartners(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setFormData({ logoUrl: '', websiteUrl: '' });
    setIsModalOpen(true);
  };

  const openEdit = (partner: Partner) => {
    setEditingId(partner.id);
    setFormData({ logoUrl: partner.logoUrl, websiteUrl: partner.websiteUrl || '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ logoUrl: '', websiteUrl: '' });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsUploadingImg(true);
      try {
        const storageRef = ref(storage, `partner_logos/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        uploadTask.on(
          "state_changed",
          null,
          (error) => {
            console.error("Upload failed:", error);
            setIsUploadingImg(false);
            showAlert("Upload Failed", "Image upload failed. Please try again.", "danger");
          },
          async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setFormData(prev => ({ ...prev, logoUrl: downloadURL }));
            setIsUploadingImg(false);
          }
        );
      } catch (err) {
        console.error(err);
        setIsUploadingImg(false);
        showAlert("Error", "An error occurred starting the upload.", "danger");
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.logoUrl) {
      showAlert("Missing Logo", "Please upload a logo before saving.", "warning");
      return;
    }
    
    setIsSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'partners', editingId), {
          logoUrl: formData.logoUrl,
          websiteUrl: formData.websiteUrl,
        });
        closeModal();
        showAlert("Updated", "Partner logo updated successfully.", "success");
      } else {
        await addDoc(collection(db, 'partners'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        closeModal();
        showAlert("Success", "Partner logo saved successfully.", "success");
      }
    } catch (err) {
      console.error("Error saving partner: ", err);
      showAlert("Error", "Failed to save partner.", "danger");
    }
    setIsSaving(false);
  };

  const handleDelete = (id: string) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Partner Logo',
      message: 'Are you sure you want to remove this partner logo? This action cannot be undone.',
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await deleteDoc(doc(db, 'partners', id));
          showAlert("Deleted", "Partner logo has been removed.", "success");
        } catch (err) {
          console.error("Error deleting partner: ", err);
          showAlert("Error", "Failed to delete partner.", "danger");
        }
      }
    });
  };

  return (
    <motion.div 
      className="client-section"
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

      <header className="page-header" style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ color: 'var(--text-primary)', fontSize: '2rem', marginBottom: '0.5rem' }}>Partner Logos</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Manage the strategic partners displayed across your sites.</p>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading partners...</div>
      ) : (
        <div className="client-grid">
          <div className="client-card upload-card" onClick={openAdd}>
            <UploadCloud size={40} className="upload-icon" />
            <div style={{ textAlign: 'center' }}>
              <div className="upload-text">Add New Partner</div>
              <div className="upload-subtext">Upload PNG / JPEG</div>
            </div>
          </div>

          {partners.map(partner => (
            <motion.div 
              key={partner.id} 
              className="client-card"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="client-admin-overlay">
                <button 
                  className="logo-action-btn edit-btn" 
                  onClick={() => openEdit(partner)} 
                  title="Edit Partner"
                >
                  <Pencil size={14} />
                </button>
                <button 
                  className="logo-action-btn delete-btn" 
                  onClick={() => handleDelete(partner.id)} 
                  title="Remove Partner"
                >
                  <Trash2 size={14} />
                </button>
                {partner.websiteUrl && (
                  <a
                    href={partner.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title={`Visit ${partner.websiteUrl}`}
                    className="logo-action-btn globe-btn"
                  >
                    <Globe size={14} />
                  </a>
                )}
              </div>
              <div className="client-logo-wrapper" style={{ height: '100%', marginBottom: 0 }}>
                <img src={partner.logoUrl} alt="Partner Logo" className="client-logo-img" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            className="client-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="client-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="client-modal-header">
                <h2 className="client-modal-title">{editingId ? 'Edit Partner Logo' : 'Add Partner Logo'}</h2>
                <button className="btn-close" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleSave}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Logo Image</label>
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', padding: '1rem' }}>
                    {isUploadingImg ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Loader2 size={18} className="spin" color="var(--accent-teal)" style={{ animation: 'spin 1s linear infinite' }} /> 
                        <span style={{ color: 'var(--text-secondary)' }}>Uploading...</span>
                      </div>
                    ) : formData.logoUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <img src={formData.logoUrl} alt="Preview" style={{ height: '40px', objectFit: 'contain' }} />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Logo uploaded ✓</span>
                        <button type="button" onClick={() => setFormData({...formData, logoUrl: ''})} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>Replace</button>
                      </div>
                    ) : (
                      <input type="file" accept="image/*" onChange={handleImageUpload} />
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    Website URL <span style={{ fontWeight: 400, fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.7 }}>(optional)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Globe size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', opacity: 0.6, pointerEvents: 'none' }} />
                    <input
                      type="url"
                      value={formData.websiteUrl}
                      onChange={e => setFormData(prev => ({ ...prev, websiteUrl: e.target.value }))}
                      placeholder="https://www.partnerwebsite.com"
                      style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.25rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button type="button" onClick={closeModal} style={{ padding: '0.75rem 1.5rem', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={isSaving || isUploadingImg} style={{ padding: '0.75rem 1.5rem', border: 'none', background: 'var(--accent-teal)', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    {isSaving ? 'Saving...' : editingId ? 'Update Partner' : 'Save Partner'}
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
