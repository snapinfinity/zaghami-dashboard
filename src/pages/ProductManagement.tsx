import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, X, Loader2, UploadCloud, Pencil, Trash2, ImageOff, Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, onSnapshot, doc, deleteDoc,
  addDoc, updateDoc, serverTimestamp, orderBy
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import './ProductManagement.css';
import type { ProductCategory, SubcategoryNode } from './ProductCategories';
import { AlertModal, type AlertType } from '../components/AlertModal';

/* ─── Helpers ─────────────────────────────────────────────────────── */
/** Flatten a subcategory tree into { id, label, depth } entries */
const flattenSubcats = (
  nodes: SubcategoryNode[],
  depth = 0
): { id: string; labelEn: string; labelAr: string; depth: number }[] => {
  const result: { id: string; labelEn: string; labelAr: string; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, labelEn: node.nameEn, labelAr: node.nameAr, depth });
    result.push(...flattenSubcats(node.children, depth + 1));
  }
  return result;
};

/** Find a subcategory name anywhere in a tree */
const findSubcatName = (nodes: SubcategoryNode[], id: string): string => {
  for (const node of nodes) {
    if (node.id === id) return node.nameEn;
    const found = findSubcatName(node.children, id);
    if (found) return found;
  }
  return '';
};

/* ─── Types ──────────────────────────────────────────────────────── */
export interface Product {
  id: string;
  slug?: string;
  categoryId: string;
  subcategoryId?: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  imageUrl: string;
  createdAt?: any;
}

const EMPTY_FORM = { slug: '', categoryId: '', subcategoryId: '', nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', imageUrl: '' };

/* ─── Component ──────────────────────────────────────────────────── */
export const ProductManagement: React.FC = () => {
  const navigate = useNavigate();

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // New states for formatting filter
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
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

  /* ── Firestore listener ───────────────────────────────────────── */
  useEffect(() => {
    const unsubCategories = onSnapshot(query(collection(db, 'product_categories'), orderBy('createdAt', 'asc')), (snap) => {
      const docs: ProductCategory[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductCategory));
      setCategories(docs);
      
      const unsubProducts = onSnapshot(query(collection(db, 'products'), orderBy('createdAt', 'asc')), (prodSnap) => {
        const prodDocs: Product[] = prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        setProducts(prodDocs);
        setLoading(false);
      });
      return () => unsubProducts();
    });
    return () => unsubCategories();
  }, []);

  const filteredProducts = useMemo(() => {
    if (selectedFilterCategory === 'all') return products;
    return products.filter(p => p.categoryId === selectedFilterCategory);
  }, [products, selectedFilterCategory]);

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.nameEn || 'Unknown Category';
  };

  /** Get the flattened subcategory list for the currently selected category */
  const availableSubcats = useMemo(() => {
    const cat = categories.find(c => c.id === formData.categoryId);
    if (!cat?.subcategories?.length) return [];
    return flattenSubcats(cat.subcategories);
  }, [categories, formData.categoryId]);

  /** Resolve subcategory name for display on a product card */
  const getSubcatName = (prod: Product): string => {
    if (!prod.subcategoryId) return '';
    const cat = categories.find(c => c.id === prod.categoryId);
    if (!cat?.subcategories) return '';
    return findSubcatName(cat.subcategories, prod.subcategoryId);
  };

  /* ── Image upload ─────────────────────────────────────────────── */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsUploadingImg(true);
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
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

  /* ── Open modal ───────────────────────────────────────────────── */
  const openAdd = () => {
    setEditingId(null);
    setFormData({
      ...EMPTY_FORM,
      categoryId: selectedFilterCategory !== 'all' ? selectedFilterCategory : (categories[0]?.id || '')
    });
    setSlugManuallyEdited(false);
    setIsModalOpen(true);
  };

  const openEdit = (prod: Product) => {
    setEditingId(prod.id);
    setFormData({
      slug: prod.slug || '',
      categoryId: prod.categoryId,
      subcategoryId: prod.subcategoryId || '',
      nameEn: prod.nameEn,
      nameAr: prod.nameAr,
      descriptionEn: prod.descriptionEn || '',
      descriptionAr: prod.descriptionAr || '',
      imageUrl: prod.imageUrl || ''
    });
    setSlugManuallyEdited(!!(prod.slug?.trim()));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setSlugManuallyEdited(false);
  };

  /* ── Save (add or update) ─────────────────────────────────────── */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.categoryId) {
      showAlert('Missing Category', 'Please select a parent category.', 'warning');
      return;
    }
    if (!formData.nameEn.trim() || !formData.nameAr.trim()) {
      showAlert('Missing Names', 'Please provide both English and Arabic names.', 'warning');
      return;
    }
    if (!formData.imageUrl) {
      showAlert('Missing Image', 'Please upload a product image.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const generateSlug = (name: string) =>
        name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const slug = editingId
        ? (formData.slug?.trim() || generateSlug(formData.nameEn.trim()))
        : generateSlug(formData.nameEn.trim());

      const dataToSave: Record<string, any> = {
        slug,
        categoryId: formData.categoryId,
        nameEn: formData.nameEn.trim(),
        nameAr: formData.nameAr.trim(),
        descriptionEn: formData.descriptionEn.trim(),
        descriptionAr: formData.descriptionAr.trim(),
        imageUrl: formData.imageUrl,
        subcategoryId: formData.subcategoryId || '',
      };

      if (editingId) {
        await updateDoc(doc(db, 'products', editingId), dataToSave);
      } else {
        await addDoc(collection(db, 'products'), {
          ...dataToSave,
          createdAt: serverTimestamp(),
        });
      }
      closeModal();
      showAlert('Success', 'Product saved successfully.', 'success');
    } catch (err) {
      console.error('Error saving product:', err);
      showAlert('Error', 'Failed to save product.', 'danger');
    }
    setIsSaving(false);
  };

  /* ── Delete ───────────────────────────────────────────────────── */
  const handleDelete = (prod: Product) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Product',
      message: `Are you sure you want to delete product "${prod.nameEn}"?`,
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await deleteDoc(doc(db, 'products', prod.id));
          showAlert('Deleted', 'Product has been deleted.', 'success');
        } catch (err) {
          console.error('Error deleting product:', err);
          showAlert('Error', 'Failed to delete product.', 'danger');
        }
      }
    });
  };

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <motion.div
      className="products-section"
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
      <header className="products-page-header">
        <h1>Product Management</h1>
        <p>Manage individual products and assign them to your website categories.</p>
      </header>

      {/* Filter and Loading state */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          Loading products…
        </div>
      ) : categories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          Please add a Product Category first before adding products.
        </div>
      ) : (
        <>
          <div className="products-filter">
            <Filter size={18} color="var(--text-secondary)" />
            <select
              value={selectedFilterCategory}
              onChange={(e) => setSelectedFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.nameEn} ({c.nameAr})</option>
              ))}
            </select>
          </div>

          <div className="products-grid">
            {/* Add card */}
            <div className="product-add-card" onClick={openAdd}>
              <UploadCloud size={40} />
              <div className="product-add-card-text">
                <div>Add New Product</div>
                <div>Add images, titles, and descriptions</div>
              </div>
            </div>

            {/* Existing products */}
            <AnimatePresence>
              {filteredProducts.map((prod) => (
                <motion.div
                  key={prod.id}
                  className="product-card"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Image */}
                  {prod.imageUrl ? (
                    <img src={prod.imageUrl} alt={prod.nameEn} className="product-card-image" />
                  ) : (
                    <div className="product-card-image-placeholder">
                      <ImageOff size={36} />
                    </div>
                  )}

                  {/* Info */}
                  <div className="product-card-body">
                    <div className="product-card-category">
                      {getCategoryName(prod.categoryId)}
                      {getSubcatName(prod) && (
                        <span className="product-card-subcat"> › {getSubcatName(prod)}</span>
                      )}
                    </div>
                    <div className="product-card-title-en">{prod.nameEn}</div>
                    <div className="product-card-desc-en">{prod.descriptionEn}</div>
                    <div className="product-card-title-ar">{prod.nameAr}</div>
                    <div className="product-card-desc-ar">{prod.descriptionAr}</div>
                  </div>

                  {/* Actions */}
                  <div className="product-card-actions">
                    <button className="cat-btn-edit" onClick={() => openEdit(prod)}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button className="cat-btn-delete" onClick={() => handleDelete(prod)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* ── Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="prod-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="prod-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              {/* Header */}
              <div className="prod-modal-header">
                <h2 className="prod-modal-title">
                  {editingId ? 'Edit Product' : 'Add New Product'}
                </h2>
                <button
                  onClick={closeModal}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave}>
                {/* Category Selection */}
                <div className="prod-form-group">
                  <label>Parent Category</label>
                  <select
                    required
                    value={formData.categoryId}
                    onChange={e => setFormData(p => ({ ...p, categoryId: e.target.value, subcategoryId: '' }))}
                  >
                    <option value="" disabled>Select a category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.nameEn} / {c.nameAr}</option>
                    ))}
                  </select>
                </div>

                {/* Subcategory Selection (only shown if category has subcategories) */}
                {availableSubcats.length > 0 && (
                  <div className="prod-form-group">
                    <label>Subcategory <span style={{ opacity: 0.6, fontWeight: 400 }}>— optional</span></label>
                    <select
                      value={formData.subcategoryId}
                      onChange={e => setFormData(p => ({ ...p, subcategoryId: e.target.value }))}
                    >
                      <option value="">— None (top-level) —</option>
                      {availableSubcats.map(s => (
                        <option key={s.id} value={s.id}>
                          {'\u00A0'.repeat(s.depth * 4)}{s.depth > 0 ? '↳ ' : ''}{s.labelEn}{s.labelAr ? ` / ${s.labelAr}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Name EN */}
                <div className="prod-form-group">
                  <label>Product Name (English)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cables & Wires"
                    value={formData.nameEn}
                    onChange={e => {
                      const val = e.target.value;
                      const autoSlug = val.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      setFormData(p => ({
                        ...p,
                        nameEn: val,
                        ...(!slugManuallyEdited ? { slug: autoSlug } : {})
                      }));
                    }}
                  />
                </div>

                {/* Slug */}
                <div className="prod-form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    URL Slug
                    {!slugManuallyEdited && <span style={{ opacity: 0.55, fontWeight: 400, fontSize: '0.8rem' }}>— auto-generated from name</span>}
                  </label>
                  <input
                    type="text"
                    value={formData.slug || ''}
                    onChange={e => {
                      setSlugManuallyEdited(true);
                      setFormData(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }));
                    }}
                    placeholder="e.g. cables-and-wires"
                    style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--accent, #27818A)' }}
                  />
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.3rem', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span>Slug: <code style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: '3px' }}>{formData.slug || 'slug'}</code></span>
                    {slugManuallyEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          const autoSlug = formData.nameEn.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                          setFormData(p => ({ ...p, slug: autoSlug }));
                          setSlugManuallyEdited(false);
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent, #27818A)', cursor: 'pointer', fontSize: '0.78rem', padding: 0, textDecoration: 'underline' }}
                      >
                        Reset to auto
                      </button>
                    )}
                  </div>
                </div>

                {/* Description EN */}
                <div className="prod-form-group">
                  <label>Description (English)</label>
                  <textarea
                    placeholder="Brief description of the product..."
                    value={formData.descriptionEn}
                    onChange={e => setFormData(p => ({ ...p, descriptionEn: e.target.value }))}
                  />
                </div>

                {/* Name AR */}
                <div className="prod-form-group">
                  <label>Product Name (Arabic — اسم المنتج)</label>
                  <input
                    type="text"
                    required
                    dir="rtl"
                    placeholder="مثال: الكابلات والأسلاك"
                    value={formData.nameAr}
                    onChange={e => setFormData(p => ({ ...p, nameAr: e.target.value }))}
                  />
                </div>

                {/* Description AR */}
                <div className="prod-form-group">
                  <label>Description (Arabic — الوصف)</label>
                  <textarea
                    dir="rtl"
                    placeholder="وصف موجز للمنتج..."
                    value={formData.descriptionAr}
                    onChange={e => setFormData(p => ({ ...p, descriptionAr: e.target.value }))}
                  />
                </div>

                {/* Image */}
                <div className="prod-form-group">
                  <label>Product Image</label>
                  <div className="prod-image-upload-box">
                    {isUploadingImg ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Loader2
                          size={18}
                          style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-teal)' }}
                        />
                        <span style={{ color: 'var(--text-secondary)' }}>Uploading image…</span>
                      </div>
                    ) : formData.imageUrl ? (
                      <div className="prod-image-preview">
                        <img src={formData.imageUrl} alt="Preview" />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Image uploaded ✓</span>
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

                {/* Footer */}
                <div className="prod-modal-footer">
                  <button type="button" className="btn-cancel" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-save-prod"
                    disabled={isSaving || isUploadingImg}
                  >
                    {isSaving ? 'Saving…' : editingId ? 'Update Product' : 'Save Product'}
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
