import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, ArrowLeft, X, Loader2, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, doc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import './ClientManagement.css';
import { AlertModal, type AlertType } from '../components/AlertModal';

export interface Client {
  id: string;
  logoUrl: string;
  createdAt?: any;
}

export const ClientManagement: React.FC = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ logoUrl: '' });
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
    const q = query(collection(db, 'clients'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Client[] = [];
      snapshot.forEach(d => {
        docs.push({ id: d.id, ...d.data() } as Client);
      });
      docs.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });
      setClients(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsUploadingImg(true);
      try {
        const storageRef = ref(storage, `client_logos/${Date.now()}_${file.name}`);
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
      showAlert("Missing Logo", "Please upload their logo before saving.", "warning");
      return;
    }
    
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'clients'), {
        ...formData,
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setFormData({ logoUrl: '' });
      showAlert("Success", "Client logo saved successfully.", "success");
    } catch (err) {
      console.error("Error saving client: ", err);
      showAlert("Error", "Failed to save client.", "danger");
    }
    setIsSaving(false);
  };

  const handleDelete = (id: string) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Client Logo',
      message: 'Are you sure you want to remove this client logo? This action cannot be undone.',
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await deleteDoc(doc(db, 'clients', id));
          showAlert("Deleted", "Client logo has been removed.", "success");
        } catch (err) {
          console.error("Error deleting client: ", err);
          showAlert("Error", "Failed to delete client.", "danger");
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
        <h1 style={{ color: 'var(--text-primary)', fontSize: '2rem', marginBottom: '0.5rem' }}>Client Logos</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Manage the high-profile organizations listed as your key clients.</p>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading clients...</div>
      ) : (
        <div className="client-grid">
          <div className="client-card upload-card" onClick={() => setIsModalOpen(true)}>
            <UploadCloud size={40} className="upload-icon" />
            <div style={{ textAlign: 'center' }}>
              <div className="upload-text">Add New Client</div>
              <div className="upload-subtext">Upload PNG / JPEG</div>
            </div>
          </div>

          {clients.map(client => (
            <motion.div 
              key={client.id} 
              className="client-card"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="client-admin-overlay">
                <button 
                  className="admin-btn delete" 
                  onClick={() => handleDelete(client.id)} 
                  title="Remove Client"
                  style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: 'white', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="client-logo-wrapper" style={{ height: '100%', marginBottom: 0 }}>
                <img src={client.logoUrl} alt="Client Logo" className="client-logo-img" />
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
                <h2 className="client-modal-title">Add Client Logo</h2>
                <button className="btn-close" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleSave}>
                <div style={{ marginBottom: '2rem' }}>
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
                        <button type="button" onClick={() => setFormData({...formData, logoUrl: ''})} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>Remove</button>
                      </div>
                    ) : (
                      <input type="file" accept="image/*" onChange={handleImageUpload} />
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '0.75rem 1.5rem', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={isSaving || isUploadingImg} style={{ padding: '0.75rem 1.5rem', border: 'none', background: 'var(--accent-teal)', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    {isSaving ? 'Saving...' : 'Save Client'}
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
