import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, X, Loader2, UploadCloud, Pencil, Trash2, ImageOff,
  ChevronRight, ChevronDown, Plus, FolderTree, Check, FolderOpen, Folder
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
export interface SubcategoryNode {
  id: string;
  nameEn: string;
  nameAr: string;
  children: SubcategoryNode[];
}

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
  subcategories?: SubcategoryNode[];
  order?: number;
  createdAt?: any;
}

const EMPTY_FORM = {
  nameEn: '', nameAr: '', subtitleEn: '', subtitleAr: '', descriptionEn: '', descriptionAr: '',
  homepageDescriptionEn: '', homepageDescriptionAr: '',
  imageUrl: '', heroImageUrl: '', homepageImage1: '', homepageImage2: '', homepageImage3: ''
};

/* ─── Utility: generate a simple unique id ───────────────────────── */
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* ─── Utility: deep-clone a subcategory tree ─────────────────────── */
const cloneTree = (nodes: SubcategoryNode[]): SubcategoryNode[] =>
  nodes.map(n => ({ ...n, children: cloneTree(n.children) }));

/* ─── Utility: update a node by id anywhere in a tree ───────────── */
const updateNodeInTree = (
  nodes: SubcategoryNode[],
  id: string,
  updater: (n: SubcategoryNode) => SubcategoryNode
): SubcategoryNode[] =>
  nodes.map(n =>
    n.id === id
      ? updater(n)
      : { ...n, children: updateNodeInTree(n.children, id, updater) }
  );

/* ─── Utility: delete a node by id ──────────────────────────────── */
const deleteNodeFromTree = (nodes: SubcategoryNode[], id: string): SubcategoryNode[] =>
  nodes
    .filter(n => n.id !== id)
    .map(n => ({ ...n, children: deleteNodeFromTree(n.children, id) }));

/* ─── Utility: add a child to a node by parent id ───────────────── */
const addChildToNode = (
  nodes: SubcategoryNode[],
  parentId: string | null,
  newNode: SubcategoryNode
): SubcategoryNode[] => {
  if (parentId === null) return [...nodes, newNode];
  return nodes.map(n =>
    n.id === parentId
      ? { ...n, children: [...n.children, newNode] }
      : { ...n, children: addChildToNode(n.children, parentId, newNode) }
  );
};

/* ═══════════════════════════════════════════════════════════════════
   SubcategoryTreeNode — recursive single-node renderer
   ═══════════════════════════════════════════════════════════════════ */
interface TreeNodeProps {
  node: SubcategoryNode;
  depth: number;
  onAdd: (parentId: string) => void;
  onEdit: (node: SubcategoryNode) => void;
  onDelete: (node: SubcategoryNode) => void;
  editingNodeId: string | null;
  editForm: { nameEn: string; nameAr: string };
  onEditFormChange: (f: { nameEn: string; nameAr: string }) => void;
  onEditSave: (id: string) => void;
  onEditCancel: () => void;
  addingChildOf: string | null;
  addForm: { nameEn: string; nameAr: string };
  onAddFormChange: (f: { nameEn: string; nameAr: string }) => void;
  onAddSave: (parentId: string) => void;
  onAddCancel: () => void;
}

const SubcategoryTreeNode: React.FC<TreeNodeProps> = ({
  node, depth,
  onAdd, onEdit, onDelete,
  editingNodeId, editForm, onEditFormChange, onEditSave, onEditCancel,
  addingChildOf, addForm, onAddFormChange, onAddSave, onAddCancel
}) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isEditing = editingNodeId === node.id;
  const isAddingChild = addingChildOf === node.id;

  return (
    <div className="subcat-node-wrapper">
      {/* Node row */}
      <div
        className="subcat-node-row"
        style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
      >
        {/* Expand toggle */}
        <button
          className="subcat-toggle-btn"
          onClick={() => setExpanded(e => !e)}
          title={expanded ? 'Collapse' : 'Expand'}
          disabled={!hasChildren && !isAddingChild}
        >
          {hasChildren || isAddingChild
            ? expanded
              ? <ChevronDown size={14} />
              : <ChevronRight size={14} />
            : <span className="subcat-leaf-dot" />}
        </button>

        {/* Folder icon */}
        <span className="subcat-folder-icon">
          {hasChildren
            ? expanded ? <FolderOpen size={14} /> : <Folder size={14} />
            : <Folder size={14} style={{ opacity: 0.4 }} />}
        </span>

        {/* Label */}
        <div className="subcat-node-label">
          <span className="subcat-node-en">{node.nameEn}</span>
          {node.nameAr && (
            <span className="subcat-node-ar">{node.nameAr}</span>
          )}
        </div>

        {/* Actions */}
        <div className="subcat-node-actions">
          <button
            className="subcat-action-btn subcat-add-btn"
            onClick={() => { setExpanded(true); onAdd(node.id); }}
            title="Add child"
          >
            <Plus size={12} />
          </button>
          <button
            className="subcat-action-btn subcat-edit-btn"
            onClick={() => onEdit(node)}
            title="Edit"
          >
            <Pencil size={12} />
          </button>
          <button
            className="subcat-action-btn subcat-delete-btn"
            onClick={() => onDelete(node)}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ paddingLeft: `${depth * 1.5 + 2.75}rem`, overflow: 'hidden' }}
          >
            <div className="subcat-inline-form">
              <div className="subcat-inline-form-row">
                <input
                  type="text"
                  placeholder="Name (English)"
                  value={editForm.nameEn}
                  onChange={e => onEditFormChange({ ...editForm, nameEn: e.target.value })}
                  autoFocus
                />
                <input
                  type="text"
                  dir="rtl"
                  placeholder="الاسم (عربي)"
                  value={editForm.nameAr}
                  onChange={e => onEditFormChange({ ...editForm, nameAr: e.target.value })}
                />
              </div>
              <div className="subcat-inline-form-actions">
                <button
                  className="subcat-form-save"
                  onClick={() => onEditSave(node.id)}
                  disabled={!editForm.nameEn.trim()}
                >
                  <Check size={13} /> Save
                </button>
                <button className="subcat-form-cancel" onClick={onEditCancel}>
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Children */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            {node.children.map(child => (
              <SubcategoryTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                onAdd={onAdd}
                onEdit={onEdit}
                onDelete={onDelete}
                editingNodeId={editingNodeId}
                editForm={editForm}
                onEditFormChange={onEditFormChange}
                onEditSave={onEditSave}
                onEditCancel={onEditCancel}
                addingChildOf={addingChildOf}
                addForm={addForm}
                onAddFormChange={onAddFormChange}
                onAddSave={onAddSave}
                onAddCancel={onAddCancel}
              />
            ))}

            {/* Inline add-child form */}
            {isAddingChild && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ paddingLeft: `${(depth + 1) * 1.5 + 2.75}rem`, overflow: 'hidden' }}
              >
                <div className="subcat-inline-form subcat-inline-form--add">
                  <div className="subcat-inline-form-label">New subcategory under <strong>{node.nameEn}</strong></div>
                  <div className="subcat-inline-form-row">
                    <input
                      type="text"
                      placeholder="Name (English)"
                      value={addForm.nameEn}
                      onChange={e => onAddFormChange({ ...addForm, nameEn: e.target.value })}
                      autoFocus
                    />
                    <input
                      type="text"
                      dir="rtl"
                      placeholder="الاسم (عربي)"
                      value={addForm.nameAr}
                      onChange={e => onAddFormChange({ ...addForm, nameAr: e.target.value })}
                    />
                  </div>
                  <div className="subcat-inline-form-actions">
                    <button
                      className="subcat-form-save"
                      onClick={() => onAddSave(node.id)}
                      disabled={!addForm.nameEn.trim()}
                    >
                      <Plus size={13} /> Add
                    </button>
                    <button className="subcat-form-cancel" onClick={onAddCancel}>
                      <X size={13} /> Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   SubcategoryPanel — full panel managing one category's subtree
   ═══════════════════════════════════════════════════════════════════ */
interface SubcategoryPanelProps {
  category: ProductCategory;
  onBack: () => void;
  showAlert: (title: string, msg: string, type?: AlertType) => void;
  setAlertConfig: React.Dispatch<React.SetStateAction<any>>;
  closeAlert: () => void;
}

const SubcategoryPanel: React.FC<SubcategoryPanelProps> = ({
  category, onBack, showAlert, setAlertConfig, closeAlert
}) => {
  const [tree, setTree] = useState<SubcategoryNode[]>(
    category.subcategories ? cloneTree(category.subcategories) : []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  /* Inline edit state */
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nameEn: '', nameAr: '' });

  /* Inline add state */
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null); // null = root
  const [addForm, setAddForm] = useState({ nameEn: '', nameAr: '' });

  const markDirty = (newTree: SubcategoryNode[]) => {
    setTree(newTree);
    setIsDirty(true);
  };

  /* ── Save to Firestore ───────────────────────────────────────── */
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'product_categories', category.id), {
        subcategories: tree
      });
      setIsDirty(false);
      showAlert('Saved', 'Subcategories saved successfully.', 'success');
    } catch (err) {
      console.error(err);
      showAlert('Error', 'Failed to save subcategories.', 'danger');
    }
    setIsSaving(false);
  };

  /* ── Add handlers ────────────────────────────────────────────── */
  const handleStartAdd = (parentId: string | null) => {
    setEditingNodeId(null);
    setAddingChildOf(parentId);
    setAddForm({ nameEn: '', nameAr: '' });
  };

  const handleAddSave = (parentId: string | null) => {
    if (!addForm.nameEn.trim()) return;
    const newNode: SubcategoryNode = {
      id: genId(),
      nameEn: addForm.nameEn.trim(),
      nameAr: addForm.nameAr.trim(),
      children: []
    };
    markDirty(addChildToNode(tree, parentId, newNode));
    setAddingChildOf(null);
    setAddForm({ nameEn: '', nameAr: '' });
  };

  const handleAddCancel = () => {
    setAddingChildOf(null);
    setAddForm({ nameEn: '', nameAr: '' });
  };

  /* ── Edit handlers ───────────────────────────────────────────── */
  const handleStartEdit = (node: SubcategoryNode) => {
    setAddingChildOf(null);
    setEditingNodeId(node.id);
    setEditForm({ nameEn: node.nameEn, nameAr: node.nameAr });
  };

  const handleEditSave = (id: string) => {
    if (!editForm.nameEn.trim()) return;
    markDirty(updateNodeInTree(tree, id, n => ({
      ...n,
      nameEn: editForm.nameEn.trim(),
      nameAr: editForm.nameAr.trim()
    })));
    setEditingNodeId(null);
  };

  const handleEditCancel = () => setEditingNodeId(null);

  /* ── Delete handler ──────────────────────────────────────────── */
  const handleDelete = (node: SubcategoryNode) => {
    const hasChildren = node.children.length > 0;
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Subcategory',
      message: hasChildren
        ? `Delete "${node.nameEn}" and all its ${node.children.length} child item(s)?`
        : `Delete "${node.nameEn}"?`,
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: () => {
        closeAlert();
        markDirty(deleteNodeFromTree(tree, node.id));
      }
    });
  };

  const totalCount = (nodes: SubcategoryNode[]): number =>
    nodes.reduce((acc, n) => acc + 1 + totalCount(n.children), 0);

  return (
    <motion.div
      className="subcat-panel"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
    >
      {/* Panel Header */}
      <div className="subcat-panel-header">
        <button className="subcat-back-btn" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Categories
        </button>
        <div className="subcat-panel-title-group">
          <div className="subcat-panel-breadcrumb">
            <span>Product Categories</span>
            <ChevronRight size={14} />
            <span className="subcat-panel-breadcrumb-current">{category.nameEn}</span>
          </div>
          <h2 className="subcat-panel-title">
            <FolderTree size={22} /> Subcategories
          </h2>
          <p className="subcat-panel-subtitle">
            {totalCount(tree)} item{totalCount(tree) !== 1 ? 's' : ''} across all levels
          </p>
        </div>
        <div className="subcat-panel-header-actions">
          <button
            className="subcat-add-root-btn"
            onClick={() => handleStartAdd(null)}
            disabled={addingChildOf === null && addingChildOf !== undefined ? false : addingChildOf === null}
          >
            <Plus size={15} /> Add Subcategory
          </button>
          <button
            className="subcat-save-btn"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? <><Loader2 size={15} className="spin-anim" /> Saving…</> : <><Check size={15} /> Save Changes</>}
          </button>
        </div>
      </div>

      {/* Unsaved indicator */}
      {isDirty && (
        <div className="subcat-unsaved-banner">
          ⚠ You have unsaved changes — click <strong>Save Changes</strong> to persist.
        </div>
      )}

      {/* Tree */}
      <div className="subcat-tree-container">
        {/* Root-level Add form */}
        <AnimatePresence>
          {addingChildOf === null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="subcat-inline-form subcat-inline-form--root subcat-inline-form--add">
                <div className="subcat-inline-form-label">New top-level subcategory</div>
                <div className="subcat-inline-form-row">
                  <input
                    type="text"
                    placeholder="Name (English)"
                    value={addForm.nameEn}
                    onChange={e => setAddForm(f => ({ ...f, nameEn: e.target.value }))}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleAddSave(null)}
                  />
                  <input
                    type="text"
                    dir="rtl"
                    placeholder="الاسم (عربي)"
                    value={addForm.nameAr}
                    onChange={e => setAddForm(f => ({ ...f, nameAr: e.target.value }))}
                  />
                </div>
                <div className="subcat-inline-form-actions">
                  <button
                    className="subcat-form-save"
                    onClick={() => handleAddSave(null)}
                    disabled={!addForm.nameEn.trim()}
                  >
                    <Plus size={13} /> Add
                  </button>
                  <button className="subcat-form-cancel" onClick={handleAddCancel}>
                    <X size={13} /> Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {tree.length === 0 && addingChildOf !== null && (
          <div className="subcat-empty-state">
            <FolderTree size={40} />
            <p>No subcategories yet.</p>
            <p>Click <strong>"Add Subcategory"</strong> to get started.</p>
          </div>
        )}

        {tree.map(node => (
          <SubcategoryTreeNode
            key={node.id}
            node={node}
            depth={0}
            onAdd={handleStartAdd}
            onEdit={handleStartEdit}
            onDelete={handleDelete}
            editingNodeId={editingNodeId}
            editForm={editForm}
            onEditFormChange={setEditForm}
            onEditSave={handleEditSave}
            onEditCancel={handleEditCancel}
            addingChildOf={addingChildOf}
            addForm={addForm}
            onAddFormChange={setAddForm}
            onAddSave={handleAddSave}
            onAddCancel={handleAddCancel}
          />
        ))}
      </div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   Main ProductCategories page
   ═══════════════════════════════════════════════════════════════════ */
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

  /* Which category's subcategory tree are we viewing? null = main grid */
  const [subcatCategoryId, setSubcatCategoryId] = useState<string | null>(null);

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

  const closeAlert = useCallback(() => setAlertConfig(prev => ({ ...prev, isOpen: false })), []);

  const showAlert = useCallback((title: string, message: string, type: AlertType = 'info') => {
    setAlertConfig({
      isOpen: true,
      type,
      title,
      message,
      confirmText: 'OK',
      showCancel: false,
      onConfirm: closeAlert
    });
  }, [closeAlert]);

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
      task.on('state_changed', null,
        (err) => { console.error('Upload failed:', err); setIsUploadingImg(false); showAlert('Upload Failed', 'Image upload failed.', 'danger'); },
        async () => { const url = await getDownloadURL(task.snapshot.ref); setFormData(prev => ({ ...prev, imageUrl: url })); setIsUploadingImg(false); }
      );
    } catch (err) { console.error(err); setIsUploadingImg(false); showAlert('Error', 'Could not start upload.', 'danger'); }
  };

  const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsUploadingHero(true);
    try {
      const storageRef = ref(storage, `product_categories_hero/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);
      task.on('state_changed', null,
        (err) => { console.error('Hero upload failed:', err); setIsUploadingHero(false); showAlert('Upload Failed', 'Hero image upload failed.', 'danger'); },
        async () => { const url = await getDownloadURL(task.snapshot.ref); setFormData(prev => ({ ...prev, heroImageUrl: url })); setIsUploadingHero(false); }
      );
    } catch (err) { console.error(err); setIsUploadingHero(false); showAlert('Error', 'Could not start hero upload.', 'danger'); }
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
      task.on('state_changed', null,
        (err) => { console.error(`Homepage image upload failed:`, err); setUploadingState(false); showAlert('Upload Failed', 'Homepage image upload failed.', 'danger'); },
        async () => { const url = await getDownloadURL(task.snapshot.ref); setFormData(prev => ({ ...prev, [imageKey]: url })); setUploadingState(false); }
      );
    } catch (err) { console.error(err); setUploadingState(false); showAlert('Error', 'Could not start upload.', 'danger'); }
  };

  /* ── Open modal ───────────────────────────────────────────────── */
  const openAdd = () => { setEditingId(null); setFormData(EMPTY_FORM); setIsModalOpen(true); };

  const openEdit = (cat: ProductCategory) => {
    setEditingId(cat.id);
    setFormData({
      nameEn: cat.nameEn, nameAr: cat.nameAr,
      subtitleEn: cat.subtitleEn || '', subtitleAr: cat.subtitleAr || '',
      descriptionEn: cat.descriptionEn || '', descriptionAr: cat.descriptionAr || '',
      homepageDescriptionEn: cat.homepageDescriptionEn || '',
      homepageDescriptionAr: cat.homepageDescriptionAr || '',
      imageUrl: cat.imageUrl, heroImageUrl: cat.heroImageUrl || '',
      homepageImage1: cat.homepageImage1 || '',
      homepageImage2: cat.homepageImage2 || '',
      homepageImage3: cat.homepageImage3 || ''
    });
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); setFormData(EMPTY_FORM); };

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
        nameEn: formData.nameEn.trim(), nameAr: formData.nameAr.trim(),
        subtitleEn: formData.subtitleEn.trim(), subtitleAr: formData.subtitleAr.trim(),
        descriptionEn: formData.descriptionEn.trim(), descriptionAr: formData.descriptionAr.trim(),
        homepageDescriptionEn: formData.homepageDescriptionEn.trim(),
        homepageDescriptionAr: formData.homepageDescriptionAr.trim(),
        imageUrl: formData.imageUrl, heroImageUrl: formData.heroImageUrl,
        homepageImage1: formData.homepageImage1,
        homepageImage2: formData.homepageImage2,
        homepageImage3: formData.homepageImage3,
      };
      if (editingId) {
        await updateDoc(doc(db, 'product_categories', editingId), categoryData);
      } else {
        await addDoc(collection(db, 'product_categories'), { ...categoryData, createdAt: serverTimestamp() });
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
      isOpen: true, type: 'danger', title: 'Delete Category',
      message: `Are you sure you want to delete category "${cat.nameEn}"?`,
      confirmText: 'Delete', showCancel: true,
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

  /* ── Subcategory count helper ─────────────────────────────────── */
  const countSubcats = (nodes: SubcategoryNode[] = []): number =>
    nodes.reduce((acc, n) => acc + 1 + countSubcats(n.children), 0);

  /* ── The category being viewed in subcat panel ────────────────── */
  const subcatCategory = subcatCategoryId
    ? categories.find(c => c.id === subcatCategoryId) ?? null
    : null;

  /* ─── Render ───────────────────────────────────────────────────── */
  return (
    <motion.div
      className="categories-section"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <AnimatePresence mode="wait">
        {/* ── Subcategory Tree Panel ─────────────────────────────── */}
        {subcatCategory ? (
          <SubcategoryPanel
            key={subcatCategory.id}
            category={subcatCategory}
            onBack={() => setSubcatCategoryId(null)}
            showAlert={showAlert}
            setAlertConfig={setAlertConfig}
            closeAlert={closeAlert}
          />
        ) : (
          /* ── Main Grid View ─────────────────────────────────────── */
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
                  {categories.map((cat) => {
                    const subcatCount = countSubcats(cat.subcategories);
                    return (
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

                          {/* Subcategory badge */}
                          {subcatCount > 0 && (
                            <div className="category-subcat-badge">
                              <FolderTree size={11} />
                              {subcatCount} subcategor{subcatCount === 1 ? 'y' : 'ies'}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="category-card-actions">
                          <button
                            className="cat-btn-subcat"
                            onClick={() => setSubcatCategoryId(cat.id)}
                            title="Manage subcategories"
                          >
                            <FolderTree size={14} /> Subcategories
                          </button>
                          <button className="cat-btn-edit" onClick={() => openEdit(cat)}>
                            <Pencil size={14} /> Edit
                          </button>
                          <button className="cat-btn-delete" onClick={() => handleDelete(cat)}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Category Modal ─────────────────────────────────────────── */}
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
                  <input type="text" required placeholder="e.g. Electrical" value={formData.nameEn}
                    onChange={e => setFormData(p => ({ ...p, nameEn: e.target.value }))} />
                </div>

                {/* Subtitle EN */}
                <div className="cat-form-group">
                  <label>Sub-heading (English) <span style={{ opacity: 0.6, fontWeight: 400 }}>— optional</span></label>
                  <input type="text" placeholder="e.g. Process Automation & Control Systems" value={formData.subtitleEn}
                    onChange={e => setFormData(p => ({ ...p, subtitleEn: e.target.value }))} />
                </div>

                {/* Description EN */}
                <div className="cat-form-group">
                  <label>Description (English) <span style={{ opacity: 0.6, fontWeight: 400 }}>— optional</span></label>
                  <textarea placeholder="Brief description of the category..." value={formData.descriptionEn}
                    onChange={e => setFormData(p => ({ ...p, descriptionEn: e.target.value }))} />
                </div>

                {/* Name AR */}
                <div className="cat-form-group">
                  <label>Category Name (Arabic — اسم الفئة)</label>
                  <input type="text" required dir="rtl" placeholder="مثال: كهربائي" value={formData.nameAr}
                    onChange={e => setFormData(p => ({ ...p, nameAr: e.target.value }))} />
                </div>

                {/* Subtitle AR */}
                <div className="cat-form-group">
                  <label>Sub-heading (Arabic — العنوان الفرعي) <span style={{ opacity: 0.6, fontWeight: 400 }}>— اختياري</span></label>
                  <input type="text" dir="rtl" placeholder="مثال: أنظمة التحكم والأتمتة" value={formData.subtitleAr}
                    onChange={e => setFormData(p => ({ ...p, subtitleAr: e.target.value }))} />
                </div>

                {/* Description AR */}
                <div className="cat-form-group">
                  <label>Description (Arabic — الوصف) <span style={{ opacity: 0.6, fontWeight: 400 }}>— اختياري</span></label>
                  <textarea dir="rtl" placeholder="وصف موجز للفئة..." value={formData.descriptionAr}
                    onChange={e => setFormData(p => ({ ...p, descriptionAr: e.target.value }))} />
                </div>

                <hr style={{ borderColor: 'var(--border-color)', margin: '1rem 0' }} />
                <h3 className="cat-modal-section-title" style={{ fontSize: '1.05rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                  Homepage Content
                </h3>

                {/* Homepage Description EN */}
                <div className="cat-form-group">
                  <label>Homepage Description (English) <span style={{ opacity: 0.6, fontWeight: 400 }}>— optional</span></label>
                  <textarea placeholder="Brief description for the homepage..." value={formData.homepageDescriptionEn}
                    onChange={e => setFormData(p => ({ ...p, homepageDescriptionEn: e.target.value }))} />
                </div>

                {/* Homepage Description AR */}
                <div className="cat-form-group">
                  <label>Homepage Description (Arabic — وصف الصفحة الرئيسية) <span style={{ opacity: 0.6, fontWeight: 400 }}>— اختياري</span></label>
                  <textarea dir="rtl" placeholder="وصف موجز للصفحة الرئيسية..." value={formData.homepageDescriptionAr}
                    onChange={e => setFormData(p => ({ ...p, homepageDescriptionAr: e.target.value }))} />
                </div>

                {/* Card Thumbnail */}
                <div className="cat-form-group">
                  <label>Card Thumbnail Image</label>
                  <div className="cat-image-upload-box">
                    {isUploadingImg ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-teal)' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>Uploading image…</span>
                      </div>
                    ) : formData.imageUrl ? (
                      <div className="cat-image-preview">
                        <img src={formData.imageUrl} alt="Preview" />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Thumbnail uploaded ✓</span>
                        <button type="button" onClick={() => setFormData(p => ({ ...p, imageUrl: '' }))}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem' }}>Remove</button>
                      </div>
                    ) : (
                      <div>
                        <UploadCloud size={24} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>PNG, JPEG or WebP recommended</div>
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
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-teal)' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>Uploading hero image…</span>
                      </div>
                    ) : formData.heroImageUrl ? (
                      <div className="cat-image-preview">
                        <img src={formData.heroImageUrl} alt="Hero Preview" />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Hero uploaded ✓</span>
                        <button type="button" onClick={() => setFormData(p => ({ ...p, heroImageUrl: '' }))}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem' }}>Remove</button>
                      </div>
                    ) : (
                      <div>
                        <UploadCloud size={24} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Landscape image recommended for Hero background</div>
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
                          <button type="button" onClick={() => setFormData(p => ({ ...p, homepageImage1: '' }))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.5rem' }}>Remove</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' }}>
                          <UploadCloud size={20} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Image 1</span>
                          <input type="file" accept="image/*" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                            onChange={(e) => handleHomepageImageUpload(e, 'homepageImage1', setIsUploadingHomePageImg1)} />
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
                          <button type="button" onClick={() => setFormData(p => ({ ...p, homepageImage2: '' }))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.5rem' }}>Remove</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' }}>
                          <UploadCloud size={20} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Image 2</span>
                          <input type="file" accept="image/*" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                            onChange={(e) => handleHomepageImageUpload(e, 'homepageImage2', setIsUploadingHomePageImg2)} />
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
                          <button type="button" onClick={() => setFormData(p => ({ ...p, homepageImage3: '' }))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.5rem' }}>Remove</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' }}>
                          <UploadCloud size={20} style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Image 3</span>
                          <input type="file" accept="image/*" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                            onChange={(e) => handleHomepageImageUpload(e, 'homepageImage3', setIsUploadingHomePageImg3)} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="cat-modal-footer">
                  <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
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
