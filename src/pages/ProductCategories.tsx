import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, X, Loader2, UploadCloud, Pencil, Trash2, ImageOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, onSnapshot, doc, deleteDoc,
  addDoc, updateDoc, serverTimestamp, orderBy
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import './ProductCategories.css';
import { AlertModal, type AlertType } from '../components/AlertModal';

/* ─── Types ──────────────────────────────────────────────────────── */
export interface ProductCategory {
  id: string;
  nameEn: string;
  nameAr: string;
  subtitleEn: string;
  subtitleAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  homepageDescriptionEn?: string;
  homepageDescriptionAr?: string;
  imageUrl: string;
  heroImageUrl?: string;
  homepageImage1?: string;
  homepageImage2?: string;
  homepageImage3?: string;
  order?: number;
  createdAt?: any;
}

const EMPTY_FORM = { 
  nameEn: '', nameAr: '', subtitleEn: '', subtitleAr: '', descriptionEn: '', descriptionAr: '', 
  homepageDescriptionEn: '', homepageDescriptionAr: '', 
  imageUrl: '', heroImageUrl: '', homepageImage1: '', homepageImage2: '', homepageImage3: '' 
};

/* ─── Component ──────────────────────────────────────────────────── */
export const ProductCategories: React.FC = () => {
  const navigate = useNavigate();

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImg, setIsUploadingImg] = useState(false);
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const [isUploadingHomePageImg1, setIsUploadingHomePageImg1] = useState(false);
  const [isUploadingHomePageImg2, setIsUploadingHomePageImg2] = useState(false);
  const [isUploadingHomePageImg3, setIsUploadingHomePageImg3] = useState(false);

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

  /* ── Firestore listener ───────────────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, 'product_categories'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs: ProductCategory[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as ProductCategory));
      setCategories(docs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /* ── Image upload ─────────────────────────────────────────────── */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsUploadingImg(true);
    try {
      const storageRef = ref(storage, `product_categories/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        null,
        (err) => {
          console.error('Upload failed:', err);
          setIsUploadingImg(false);
          showAlert('Upload Failed', 'Image upload failed.', 'danger');
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setFormData(prev => ({ ...prev, imageUrl: url }));
          setIsUploadingImg(false);
        }
      );
    } catch (err) {
      console.error(err);
      setIsUploadingImg(false);
      showAlert('Error', 'Could not start upload.', 'danger');
    }
  };

  const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsUploadingHero(true);
    try {
      const storageRef = ref(storage, `product_categories_hero/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        null,
        (err) => {
          console.error('Hero upload failed:', err);
          setIsUploadingHero(false);
          showAlert('Upload Failed', 'Hero image upload failed.', 'danger');
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setFormData(prev => ({ ...prev, heroImageUrl: url }));
          setIsUploadingHero(false);
        }
      );
    } catch (err) {
      console.error(err);
      setIsUploadingHero(false);
      showAlert('Error', 'Could not start hero upload.', 'danger');
    }
  };

  const handleHomepageImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    imageKey: 'homepageImage1' | 'homepageImage2' | 'homepageImage3',
    setUploadingState: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setUploadingState(true);
    try {
      const storageRef = ref(storage, `product_categories_homepage/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        null,
        (err) => {
          console.error(`Homepage image upload failed:`, err);
          setUploadingState(false);
          showAlert('Upload Failed', 'Homepage image upload failed.', 'danger');
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setFormData(prev => ({ ...prev, [imageKey]: url }));
          setUploadingState(false);
        }
      );
    } catch (err) {
      console.error(err);
      setUploadingState(false);
      showAlert('Error', 'Could not start upload.', 'danger');
    }
  };

  /* ── Open modal ───────────────────────────────────────────────── */
  const openAdd = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (cat: ProductCategory) => {
    setEditingId(cat.id);
    setFormData({
      nameEn: cat.nameEn,
      nameAr: cat.nameAr,
      subtitleEn: cat.subtitleEn || '',
      subtitleAr: cat.subtitleAr || '',
      descriptionEn: cat.descriptionEn || '',
      descriptionAr: cat.descriptionAr || '',
      homepageDescriptionEn: cat.homepageDescriptionEn || '',
      homepageDescriptionAr: cat.homepageDescriptionAr || '',
      imageUrl: cat.imageUrl,
      heroImageUrl: cat.heroImageUrl || '',
      homepageImage1: cat.homepageImage1 || '',
      homepageImage2: cat.homepageImage2 || '',
      homepageImage3: cat.homepageImage3 || ''
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  /* ── Save (add or update) ─────────────────────────────────────── */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nameEn.trim() || !formData.nameAr.trim()) {
      showAlert('Missing Names', 'Please provide both English and Arabic names.', 'warning');
      return;
    }
    if (!formData.imageUrl) {
      showAlert('Missing Image', 'Please upload a category image.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const categoryData = {
        nameEn: formData.nameEn.trim(),
        nameAr: formData.nameAr.trim(),
        subtitleEn: formData.subtitleEn.trim(),
        subtitleAr: formData.subtitleAr.trim(),
        descriptionEn: formData.descriptionEn.trim(),
        descriptionAr: formData.descriptionAr.trim(),
        homepageDescriptionEn: formData.homepageDescriptionEn.trim(),
        homepageDescriptionAr: formData.homepageDescriptionAr.trim(),
        imageUrl: formData.imageUrl,
        heroImageUrl: formData.heroImageUrl,
        homepageImage1: formData.homepageImage1,
        homepageImage2: formData.homepageImage2,
        homepageImage3: formData.homepageImage3,
      };

      if (editingId) {
        await updateDoc(doc(db, 'product_categories', editingId), categoryData);
      } else {
        await addDoc(collection(db, 'product_categories'), {
          ...categoryData,
          createdAt: serverTimestamp(),
        });
      }
      closeModal();
      showAlert('Success', 'Category saved successfully.', 'success');
    } catch (err) {
      console.error('Error saving category:', err);
      showAlert('Error', 'Failed to save category.', 'danger');
    }
    setIsSaving(false);
  };

  /* ── Delete ───────────────────────────────────────────────────── */
  const handleDelete = (cat: ProductCategory) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Category',
      message: `Are you sure you want to delete category "${cat.nameEn}"?`,
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await deleteDoc(doc(db, 'product_categories', cat.id));
          showAlert('Deleted', 'Category has been deleted.', 'success');
        } catch (err) {
          console.error('Error deleting category:', err);
          showAlert('Error', 'Failed to delete category.', 'danger');
        }
      }
    });
  };

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <motion.div
      className="categories-section"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Back */}
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'none', border: 'none', color: 'var(--text-secondary)',
          cursor: 'pointer', marginBottom: '2rem', padding: 0
        }}
      >
        <ArrowLeft size={18} />
        <span>Back to Dashboard</span>
      </button>

      {/* Page header */}
      <header className="categories-page-header">
        <h1>Product Categories</h1>
        <p>Manage product divisions displayed on the website — with full Arabic support.</p>
      </header>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          Loading categories…
        </div>
      ) : (
        <div className="categories-grid">
          {/* Add card */}
          <div className="category-add-card" onClick={openAdd}>
            <UploadCloud size={40} />
            <div className="category-add-card-text">
              <div>Add New Category</div>
              <div>Upload image + bilingual name</div>
            </div>
          </div>

          {/* Existing categories */}
          <AnimatePresence>
            {categories.map((cat) => (
              <motion.div
                key={cat.id}
                className="category-card"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                {/* Image */}
                {cat.imageUrl ? (
                  <img src={cat.imageUrl} alt={cat.nameEn} className="category-card-image" />
                ) : (
                  <div className="category-card-image-placeholder">
                    <ImageOff size={36} />
                  </div>
                )}

                {/* Titles */}
                <div className="category-card-body">
                  <div className="category-card-title-en">{cat.nameEn}</div>
                  {cat.subtitleEn && (
                    <div className="category-card-subtitle-en">{cat.subtitleEn}</div>
                  )}
                  <div className="category-card-title-ar">{cat.nameAr}</div>
                  {cat.subtitleAr && (
                    <div className="category-card-subtitle-ar">{cat.subtitleAr}</div>
                  )}
                </div>

                {/* Actions */}
                <div className="category-card-actions">
                  <button className="cat-btn-edit" onClick={() => openEdit(cat)}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button className="cat-btn-delete" onClick={() => handleDelete(cat)}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="cat-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="cat-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              {/* Header */}
              <div className="cat-modal-header">
                <h2 className="cat-modal-title">
                  {editingId ? 'Edit Category' : 'Add Product Category'}
                </h2>
                <button
                  onClick={closeModal}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave}>
                {/* Name EN */}
                <div className="cat-form-group">
                  <label>Category Name (English)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Electrical"
                    value={formData.nameEn}
                    onChange={e => setFormData(p => ({ ...p, nameEn: e.target.value }))}
                  />
                </div>

                {/* Subtitle EN */}
                <div className="cat-form-group">
                  <label>Sub-heading (English) <span style={{ opacity: 0.6, fontWeight: 400 }}>— optional</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Process Automation & Control Systems"
                    value={formData.subtitleEn}
                    onChange={e => setFormData(p => ({ ...p, subtitleEn: e.target.value }))}
                  />
                </div>

                {/* Description EN */}
                <div className="cat-form-group">
                  <label>Description (English) <span style={{ opacity: 0.6, fontWeight: 400 }}>— optional</span></label>
                  <textarea
                    placeholder="Brief description of the category..."
                    value={formData.descriptionEn}
                    onChange={e => setFormData(p => ({ ...p, descriptionEn: e.target.value }))}
                  />
                </div>

                {/* Name AR */}
                <div className="cat-form-group">
                  <label>Category Name (Arabic — اسم الفئة)</label>
                  <input
                    type="text"
                    required
                    dir="rtl"
                    placeholder="مثال: كهربائي"
                    value={formData.nameAr}
                    onChange={e => setFormData(p => ({ ...p, nameAr: e.target.value }))}
                  />
                </div>

                {/* Subtitle AR */}
                <div className="cat-form-group">
                  <label>Sub-heading (Arabic — العنوان الفرعي) <span style={{ opacity: 0.6, fontWeight: 400 }}>— اختياري</span></label>
                  <input
                    type="text"
                    dir="rtl"
                    placeholder="مثال: أنظمة التحكم والأتمتة"
                    value={formData.subtitleAr}
                    onChange={e => setFormData(p => ({ ...p, subtitleAr: e.target.value }))}
                  />
                </div>

                {/* Description AR */}
                <div className="cat-form-group">
                  <label>Description (Arabic — الوصف) <span style={{ opacity: 0.6, fontWeight: 400 }}>— اختياري</span></label>
                  <textarea
                    dir="rtl"
                    placeholder="وصف موجز للفئة..."
                    value={formData.descriptionAr}
                    onChange={e => setFormData(p => ({ ...p, descriptionAr: e.target.value }))}
                  />
                </div>

                <hr style={{ borderColor: 'var(--border-color)', margin: '1rem 0' }} />
                <h3 className="cat-modal-section-title" style={{ fontSize: '1.05rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                  Homepage Content
                </h3>

                {/* Homepage Description EN */}
                <div className="cat-form-group">
                  <label>Homepage Description (English) <span style={{ opacity: 0.6, fontWeight: 400 }}>— optional</span></label>
                  <textarea
                    placeholder="Brief description for the homepage..."
                    value={formData.homepageDescriptionEn}
                    onChange={e => setFormData(p => ({ ...p, homepageDescriptionEn: e.target.value }))}
                  />
                </div>

                {/* Homepage Description AR */}
                <div className="cat-form-group">
                  <label>Homepage Description (Arabic — وصف الصفحة الرئيسية) <span style={{ opacity: 0.6, fontWeight: 400 }}>— اختياري</span></label>
                  <textarea
                    dir="rtl"
                    placeholder="وصف موجز للصفحة الرئيسية..."
                    value={formData.homepageDescriptionAr}
                    onChange={e => setFormData(p => ({ ...p, homepageDescriptionAr: e.target.value }))}
                  />
                </div>

                {/* Image */}
                <div className="cat-form-group">
                  <label>Card Thumbnail Image</label>
                  <div className="cat-image-upload-box">
                    {isUploadingImg ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Loader2
                          size={18}
                          style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-teal)' }}
                        />
                        <span style={{ color: 'var(--text-secondary)' }}>Uploading image…</span>
                      </div>
                    ) : formData.imageUrl ? (
                      <div className="cat-image-preview">
                        <img src={formData.imageUrl} alt="Preview" />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Thumbnail uploaded ✓</span>
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, imageUrl: '' }))}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div>
                        <UploadCloud size={24} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                          PNG, JPEG or WebP recommended
                        </div>
                        <input type="file" accept="image/*" onChange={handleImageUpload} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Hero Image */}
                <div className="cat-form-group">
                  <label>Hero Image (Details Page) <span style={{ opacity: 0.6, fontWeight: 400 }}>— optional</span></label>
                  <div className="cat-image-upload-box">
                    {isUploadingHero ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Loader2
                          size={18}
                          style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-teal)' }}
                        />
                        <span style={{ color: 'var(--text-secondary)' }}>Uploading hero image…</span>
                      </div>
                    ) : formData.heroImageUrl ? (
                      <div className="cat-image-preview">
                        <img src={formData.heroImageUrl} alt="Hero Preview" />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Hero uploaded ✓</span>
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, heroImageUrl: '' }))}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div>
                        <UploadCloud size={24} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                          Landscape image recommended for Hero background
                        </div>
                        <input type="file" accept="image/*" onChange={handleHeroImageUpload} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Homepage Images */}
                <div className="cat-form-group">
                  <label>Homepage Images <span style={{ opacity: 0.6, fontWeight: 400 }}>— optional (up to 3)</span></label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    
                    {/* Image 1 */}
                    <div className="cat-image-upload-box" style={{ padding: '1rem', minHeight: '120px' }}>
                      {isUploadingHomePageImg1 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-teal)' }} />
                        </div>
                      ) : formData.homepageImage1 ? (
                        <div className="cat-image-preview">
                          <img src={formData.homepageImage1} alt="Home 1" style={{ maxHeight: '80px', objectFit: 'cover' }} />
                          <button
                            type="button"
                            onClick={() => setFormData(p => ({ ...p, homepageImage1: '' }))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.5rem' }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' }}>
                          <UploadCloud size={20} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Image 1</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                            onChange={(e) => handleHomepageImageUpload(e, 'homepageImage1', setIsUploadingHomePageImg1)} 
                          />
                        </div>
                      )}
                    </div>

                    {/* Image 2 */}
                    <div className="cat-image-upload-box" style={{ padding: '1rem', minHeight: '120px' }}>
                      {isUploadingHomePageImg2 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-teal)' }} />
                        </div>
                      ) : formData.homepageImage2 ? (
                        <div className="cat-image-preview">
                          <img src={formData.homepageImage2} alt="Home 2" style={{ maxHeight: '80px', objectFit: 'cover' }} />
                          <button
                            type="button"
                            onClick={() => setFormData(p => ({ ...p, homepageImage2: '' }))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.5rem' }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' }}>
                          <UploadCloud size={20} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Image 2</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                            onChange={(e) => handleHomepageImageUpload(e, 'homepageImage2', setIsUploadingHomePageImg2)} 
                          />
                        </div>
                      )}
                    </div>

                    {/* Image 3 */}
                    <div className="cat-image-upload-box" style={{ padding: '1rem', minHeight: '120px' }}>
                      {isUploadingHomePageImg3 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-teal)' }} />
                        </div>
                      ) : formData.homepageImage3 ? (
                        <div className="cat-image-preview">
                          <img src={formData.homepageImage3} alt="Home 3" style={{ maxHeight: '80px', objectFit: 'cover' }} />
                          <button
                            type="button"
                            onClick={() => setFormData(p => ({ ...p, homepageImage3: '' }))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.5rem' }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' }}>
                          <UploadCloud size={20} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Image 3</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                            onChange={(e) => handleHomepageImageUpload(e, 'homepageImage3', setIsUploadingHomePageImg3)} 
                          />
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Footer */}
                <div className="cat-modal-footer">
                  <button type="button" className="btn-cancel" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-save-cat"
                    disabled={isSaving || isUploadingImg || isUploadingHero || isUploadingHomePageImg1 || isUploadingHomePageImg2 || isUploadingHomePageImg3}
                  >
                    {isSaving ? 'Saving…' : editingId ? 'Update Category' : 'Save Category'}
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
