import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, ArrowLeft, X, Loader2, Calendar, Clock, ArrowRight, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import './BlogManagement.css';
import { AlertModal, type AlertType } from '../components/AlertModal';

export interface Insight {
  id: string;
  slug: string;
  type: 'BLOG' | 'NEWS';
  status: 'Published' | 'Draft';
  imageUrl: string;
  readTime: string;
  isFeatured: boolean;
  publishedDate: string;
  
  titleEn: string;
  summaryEn: string;
  contentEn: string;
  
  titleAr: string;
  summaryAr: string;
  contentAr: string;
  
  createdAt?: any;
}

const emptyInsight: Partial<Insight> = {
  slug: '',
  type: 'BLOG',
  status: 'Draft',
  imageUrl: '',
  readTime: '5 min read',
  isFeatured: false,
  publishedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
  titleEn: '', summaryEn: '', contentEn: '',
  titleAr: '', summaryAr: '', contentAr: ''
};

export const BlogManagement: React.FC = () => {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('All Categories');
  const [filterStatus, setFilterStatus] = useState('All Status');
  
  // Editor State
  // View Router State
  const [viewMode, setViewMode] = useState<'LIST' | 'EDIT' | 'VIEW'>('LIST');
  const [currentLang, setCurrentLang] = useState<'EN' | 'AR'>('EN');
  const [formData, setFormData] = useState<Partial<Insight>>(emptyInsight);
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
    const q = query(collection(db, 'insights'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Insight[] = [];
      snapshot.forEach(d => {
        docs.push({ id: d.id, ...d.data() } as Insight);
      });
      // Sort newest first
      docs.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });
      setInsights(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenEditor = (insight?: Insight) => {
    if (insight) {
      setFormData(insight);
    } else {
      setFormData({
        ...emptyInsight,
        publishedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      });
    }
    setCurrentLang('EN');
    setViewMode('EDIT');
  };

  const handleOpenView = (insight: Insight) => {
    setFormData(insight);
    setViewMode('VIEW');
  };

  const handleCloseEditor = () => {
    setViewMode('LIST');
    setFormData(emptyInsight);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => {
        const newData = { ...prev, [name]: value };
        // Auto-generate slug from English title
        if (name === 'titleEn') {
          newData.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        }
        return newData;
      });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsUploadingImg(true);
      try {
        const storageRef = ref(storage, `blog_covers/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        uploadTask.on(
          "state_changed",
          null, // omit progress
          (error) => {
            console.error("Upload failed:", error);
            setIsUploadingImg(false);
            showAlert("Upload Failed", "Image upload failed. Ensure your Firebase Storage rules allow writing.", "danger");
          },
          async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setFormData(prev => ({ ...prev, imageUrl: downloadURL }));
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

    if (!formData.titleEn?.trim() || !formData.contentEn?.trim()) {
      showAlert("Missing Fields", "Please ensure all English fields (Title, Content) are filled.", "warning");
      return;
    }
    if (!formData.titleAr?.trim() || !formData.contentAr?.trim()) {
      showAlert("Missing Arabic Content", "Arabic layout is compulsory. Please switch to the Arabic layout tab and fill out the Title and Content.", "warning");
      return;
    }

    // Auto-calculate read time based on English content length (~200 words per minute)
    const contentEnStr = formData.contentEn?.trim() || '';
    const contentArStr = formData.contentAr?.trim() || '';
    const words = contentEnStr.split(/\s+/).length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
    
    // Auto-generate summary from content if not present
    const genSummaryEn = contentEnStr.substring(0, 120) + (contentEnStr.length > 120 ? '...' : '');
    const genSummaryAr = contentArStr.substring(0, 120) + (contentArStr.length > 120 ? '...' : '');

    const dataToSave = { 
      ...formData, 
      readTime: `${readTimeMinutes} min read`,
      summaryEn: formData.summaryEn?.trim() || genSummaryEn,
      summaryAr: formData.summaryAr?.trim() || genSummaryAr
    };

    setIsSaving(true);
    try {
      if (formData.id) {
        // Update existing
        await setDoc(doc(db, 'insights', formData.id), dataToSave, { merge: true });
      } else {
        // Create new
        await addDoc(collection(db, 'insights'), {
          ...dataToSave,
          createdAt: serverTimestamp()
        });
      }
      handleCloseEditor();
      showAlert("Success", "Post saved successfully.", "success");
    } catch (err) {
      console.error("Error saving document: ", err);
      showAlert("Error", "Failed to save post.", "danger");
    }
    setIsSaving(false);
  };

  const handleDelete = (id: string, title: string) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Post',
      message: `Are you sure you want to delete "${title}"? This cannot be undone.`,
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await deleteDoc(doc(db, 'insights', id));
          showAlert("Deleted", "Post has been removed.", "success");
        } catch (err) {
          console.error("Error deleting document: ", err);
          showAlert("Error", "Failed to delete post.", "danger");
        }
      }
    });
  };

  const filteredInsights = insights.filter(ins => {
    const matchesCategory = filterType === 'All Categories' || ins.type === filterType.toUpperCase();
    const matchesStatus = filterStatus === 'All Status' || ins.status === filterStatus;
    return matchesCategory && matchesStatus;
  });

  return (
    <motion.div 
      className="max-w-content"
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

      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
        <div>
          <h1 className="header-title" style={{ color: 'var(--text-primary)', fontSize: '2rem', marginBottom: '0.5rem' }}>Insights & Blog</h1>
        </div>
        {viewMode === 'LIST' && (
          <button className="btn btn-primary" onClick={() => handleOpenEditor()}>
            <Plus size={18} />
            <span>Add Blog</span>
          </button>
        )}
      </header>

      <AnimatePresence mode="wait">
        {viewMode === 'EDIT' ? (
          <motion.div
            key="editor"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="editor-container panel"
          >
            <div className="editor-header">
              <h2 className="text-xl font-bold">{formData.id ? 'Edit Post' : 'Create New Post'}</h2>
              <button className="btn-close" onClick={handleCloseEditor} type="button">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="form-section-global">
                <h3 className="section-label">Global Configuration</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Category Tag</label>
                    <select name="type" value={formData.type || 'BLOG'} onChange={handleChange}>
                      <option value="BLOG">BLOG</option>
                      <option value="NEWS">NEWS</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Post Status</label>
                    <select name="status" value={formData.status || 'Draft'} onChange={handleChange}>
                      <option value="Draft">Draft</option>
                      <option value="Published">Published</option>
                    </select>
                  </div>


                  <div className="form-group">
                    <label>Cover Image</label>
                    <div className="img-input-wrap">
                      {isUploadingImg ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.85rem' }}>
                          <Loader2 size={18} className="spin" color="var(--accent-teal)" style={{ animation: 'spin 1s linear infinite' }} /> 
                          <span style={{ color: 'var(--text-secondary)' }}>Uploading to Firebase...</span>
                        </div>
                      ) : formData.imageUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                          <img src={formData.imageUrl} alt="Cover Preview" style={{ width: '80px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => setFormData(prev => ({...prev, imageUrl: ''}))}>Remove Image</button>
                        </div>
                      ) : (
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ paddingLeft: '0.85rem' }} />
                      )}
                    </div>
                  </div>
                  <div className="form-group featured-toggle-group">
                    <label className={`featured-toggle-wrapper ${formData.isFeatured ? 'active' : ''}`}>
                      <div className="featured-toggle-info">
                        <div className="featured-icon-box">
                          <Star size={20} className={formData.isFeatured ? "star-active" : "star-inactive"} />
                        </div>
                        <div>
                          <span className="featured-title">Highlight as Featured Post</span>
                          <span className="featured-desc">Post will appear prominently at the top of the insights page.</span>
                        </div>
                      </div>
                      <div className="modern-toggle">
                        <input 
                          type="checkbox" 
                          name="isFeatured" 
                          checked={formData.isFeatured || false} 
                          onChange={handleChange} 
                          className="toggle-checkbox"
                        />
                        <div className="toggle-bg"></div>
                        <div className="toggle-knob"></div>
                      </div>
                    </label>
                  </div>
                  <div className="form-group">
                    <label>Override Published Date</label>
                    <input type="text" name="publishedDate" value={formData.publishedDate || ''} onChange={handleChange} />
                  </div>
                </div>
              </div>

              <div className="form-section-localized">
                <div className="language-tabs">
                  <button type="button" className={`lang-tab-btn ${currentLang === 'EN' ? 'active' : ''}`} onClick={() => setCurrentLang('EN')}>
                    English Layout
                  </button>
                  <button type="button" className={`lang-tab-btn ${currentLang === 'AR' ? 'active' : ''}`} onClick={() => setCurrentLang('AR')}>
                    Arabic Layout (RTL)
                  </button>
                </div>

                <div className={`localized-fields ${currentLang === 'AR' ? 'rtl-mode' : ''}`}>
                  <div className="form-group full-width">
                    <label>{currentLang === 'EN' ? 'Title' : 'Title (Arabic)'}</label>
                    <input 
                      type="text" 
                      name={currentLang === 'EN' ? 'titleEn' : 'titleAr'} 
                      value={(currentLang === 'EN' ? formData.titleEn : formData.titleAr) || ''} 
                      onChange={handleChange} 
                      className={currentLang === 'AR' ? 'rtl-input' : ''}
                      required 
                    />
                  </div>
                  {currentLang === 'EN' && (
                    <div className="form-group full-width">
                      <label>Slug</label>
                      <input type="text" name="slug" value={formData.slug || ''} onChange={handleChange} />
                    </div>
                  )}

                  <div className="form-group full-width">
                    <label>{currentLang === 'EN' ? 'Full Article Content' : 'Full Article Content (Arabic)'}</label>
                    <textarea 
                      name={currentLang === 'EN' ? 'contentEn' : 'contentAr'} 
                      value={(currentLang === 'EN' ? formData.contentEn : formData.contentAr) || ''} 
                      onChange={handleChange} 
                      className={`tall-textarea ${currentLang === 'AR' ? 'rtl-input' : ''}`}
                    />
                  </div>
                </div>
              </div>

              <div className="editor-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseEditor} disabled={isSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Publish Post to Database'}
                </button>
              </div>
            </form>
          </motion.div>
        ) : viewMode === 'VIEW' ? (
          <motion.div
            key="view"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="editor-container panel"
          >
            <div className="editor-header" style={{ marginBottom: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '1.5rem' }}>
               <button onClick={() => setViewMode('LIST')} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                 <ArrowLeft size={16} /> Back to List
               </button>
               <div style={{ display: 'flex', gap: '1rem' }}>
                 <button onClick={() => setViewMode('EDIT')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                   <Edit2 size={16} /> Edit Post
                 </button>
                 <button onClick={() => {
                   if (formData.id) {
                     handleDelete(formData.id, formData.titleEn!);
                     setViewMode('LIST');
                   }
                 }} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5' }}>
                   <Trash2 size={16} /> Delete Post
                 </button>
               </div>
            </div>
            
            <div style={{ padding: '2rem 1rem' }}>
              {formData.imageUrl && (
                <div style={{ width: '100%', height: '400px', borderRadius: '16px', overflow: 'hidden', marginBottom: '3rem', position: 'relative' }}>
                  <img src={formData.imageUrl} alt={formData.titleEn} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {formData.isFeatured && (
                     <div style={{ position: 'absolute', top: '1rem', left: '1rem', backgroundColor: '#000', color: '#fff', padding: '0.4rem 1rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>FEATURED</div>
                  )}
                  {formData.status === 'Draft' && (
                     <div style={{ position: 'absolute', top: '1rem', right: '1rem', backgroundColor: '#f59e0b', color: '#fff', padding: '0.4rem 1rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>DRAFT</div>
                  )}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '4rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <span className={`category-pill ${formData.type?.toLowerCase()}`}>{formData.type}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{formData.publishedDate} • {formData.readTime}</span>
                  </div>
                  <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.5rem', lineHeight: 1.2 }}>{formData.titleEn}</h1>
                  <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '2rem', borderLeft: '4px solid var(--border-color)', paddingLeft: '1rem', fontStyle: 'italic' }}>{formData.summaryEn}</p>
                  <div style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: '1.05rem', whiteSpace: 'pre-wrap' }}>
                    {formData.contentEn || <span style={{ color: 'var(--text-secondary)' }}>No English content written yet.</span>}
                  </div>
                </div>
                
                <div style={{ flex: 1, direction: 'rtl', textAlign: 'right', borderRight: '1px solid var(--border-color)', paddingRight: '4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <span className={`category-pill ${formData.type?.toLowerCase()}`}>{formData.type}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{formData.publishedDate} • {formData.readTime}</span>
                  </div>
                  <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.5rem', lineHeight: 1.2, fontFamily: 'Arial, sans-serif' }}>{formData.titleAr || 'بدون عنوان'}</h1>
                  <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '2rem', borderRight: '4px solid var(--border-color)', paddingRight: '1rem', fontStyle: 'italic', fontFamily: 'Arial, sans-serif' }}>{formData.summaryAr}</p>
                  <div style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: '1.05rem', whiteSpace: 'pre-wrap', fontFamily: 'Arial, sans-serif' }}>
                    {formData.contentAr || <span style={{ color: 'var(--text-secondary)' }}>لا يوجد محتوى عربي بعد.</span>}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="table-controls panel" style={{ display: 'flex', padding: '1rem 1.5rem', marginBottom: '1.5rem', gap: '1rem' }}>
              <div className="filter-controls">
                <select className="status-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="All Status">All Status</option>
                  <option value="Published">Published</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>
              <div className="filter-controls">
                <select className="status-filter" value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option value="All Categories">All Categories</option>
                  <option value="Blog">Blogs</option>
                  <option value="News">News</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading live insights...</div>
            ) : filteredInsights.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No insights found.</div>
            ) : (
              <>
                {filteredInsights.filter(i => i.isFeatured).length > 0 && (
                  <div className="grid-section">
                    <h2 className="grid-section-title">Featured</h2>
                    <div className="featured-grid">
                      {filteredInsights.filter(i => i.isFeatured).map(ins => (
                        <div key={ins.id} className="insight-card" onClick={() => handleOpenView(ins)} style={{ cursor: 'pointer' }}>
                          <div className="card-admin-overlay">
                            <button className="admin-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenEditor(ins); }} title="Edit Post">
                              <Edit2 size={16} />
                            </button>
                            <button className="admin-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(ins.id, ins.titleEn); }} title="Delete Post">
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div className="card-img-wrapper">
                            {ins.imageUrl ? (
                              <img src={ins.imageUrl} alt={ins.titleEn} className="card-img" />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>No Image</div>
                            )}
                          </div>
                          <div className="card-body">
                            <div className="card-meta-row">
                              <span className={`category-pill ${ins.type.toLowerCase()}`}>{ins.type}</span>
                              {ins.status === 'Draft' && (
                                <span className="category-pill" style={{ backgroundColor: '#94a3b8', color: 'white' }}>DRAFT</span>
                              )}
                              <div className="meta-item">
                                <Calendar size={14} />
                                <span>{ins.publishedDate}</span>
                              </div>
                              <div className="meta-item">
                                <Clock size={14} />
                                <span>{ins.readTime}</span>
                              </div>
                            </div>
                            <h3 className="card-title">{ins.titleEn}</h3>
                            <p className="card-summary">{ins.summaryEn?.length > 120 ? ins.summaryEn.substring(0, 120) + '...' : ins.summaryEn}</p>
                            <div className="card-footer">
                              <span>Read More</span>
                              <ArrowRight size={14} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredInsights.filter(i => !i.isFeatured).length > 0 && (
                  <div className="grid-section">
                    <h2 className="grid-section-title">Latest Insights</h2>
                    <div className="latest-grid">
                      {filteredInsights.filter(i => !i.isFeatured).map(ins => (
                        <div key={ins.id} className="insight-card" onClick={() => handleOpenView(ins)} style={{ cursor: 'pointer' }}>
                          <div className="card-admin-overlay">
                            <button className="admin-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenEditor(ins); }} title="Edit Post">
                              <Edit2 size={16} />
                            </button>
                            <button className="admin-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(ins.id, ins.titleEn); }} title="Delete Post">
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div className="card-img-wrapper">
                            {ins.imageUrl ? (
                              <img src={ins.imageUrl} alt={ins.titleEn} className="card-img" />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>No Image</div>
                            )}
                          </div>
                          <div className="card-body">
                            <div className="card-meta-row">
                              <span className={`category-pill ${ins.type.toLowerCase()}`}>{ins.type}</span>
                              {ins.status === 'Draft' && (
                                <span className="category-pill" style={{ backgroundColor: '#94a3b8', color: 'white' }}>DRAFT</span>
                              )}
                              <div className="meta-item">
                                <Calendar size={14} />
                                <span>{ins.publishedDate}</span>
                              </div>
                              <div className="meta-item">
                                <Clock size={14} />
                                <span>{ins.readTime}</span>
                              </div>
                            </div>
                            <h3 className="card-title">{ins.titleEn}</h3>
                            <p className="card-summary">{ins.summaryEn?.length > 120 ? ins.summaryEn.substring(0, 120) + '...' : ins.summaryEn}</p>
                            <div className="card-footer">
                              <span>Read More</span>
                              <ArrowRight size={14} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
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
