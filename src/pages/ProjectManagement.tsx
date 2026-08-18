import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit2, Trash2, ArrowLeft, X, Loader2, Beaker, Zap, Building, Droplets,
  Factory, Cog, Wrench, Shield, ShieldCheck, Flame, Hammer, Truck, Package, Plug, Lightbulb, Activity, Layers, Box, MapPin,
  ChevronLeft, ChevronRight, ChevronDown, Search, Upload,
  Landmark, Store, Train, Stethoscope, Server, Leaf, HardHat, Fuel
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { prepareImage, MAX_EDGE, UPLOAD_METADATA } from '../lib/uploadImage';
import './ProjectManagement.css';
import '../pages/BlogManagement.css'; // Re-use form styles
import { AlertModal, type AlertType } from '../components/AlertModal';
import Select, { type StylesConfig } from 'react-select';
import { getData } from 'country-list';
import ReactCountryFlag from 'react-country-flag';

interface CountryOption { value: string; label: string; code: string; }

const countryOptions: CountryOption[] = getData()
  .map(({ code, name }) => {
    // Clean up formal names like "United Arab Emirates (the)" -> "United Arab Emirates"
    const cleanName = name.replace(/ \((the|The)\)$/, '').replace(/, (the|The)$/, '');
    return { value: cleanName, label: cleanName, code };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

const getCountryCode = (countryName: string) => {
  const found = countryOptions.find(o => o.value === countryName);
  return found ? found.code : null;
};

const countrySelectStyles: StylesConfig<CountryOption, false> = {
  control: (base, state) => ({
    ...base,
    background: 'var(--bg-secondary, #1e293b)',
    borderColor: state.isFocused ? 'var(--accent, #27818A)' : 'var(--border-color, #334155)',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(39,129,138,0.25)' : 'none',
    borderRadius: '8px',
    minHeight: '42px',
    cursor: 'pointer',
    '&:hover': { borderColor: 'var(--accent, #27818A)' },
  }),
  menu: base => ({
    ...base,
    background: 'var(--bg-secondary, #1e293b)',
    border: '1px solid var(--border-color, #334155)',
    borderRadius: '8px',
    zIndex: 9999,
  }),
  menuList: base => ({ ...base, padding: '4px', maxHeight: '260px' }),
  option: (base, state) => ({
    ...base,
    background: state.isSelected
      ? 'var(--accent, #27818A)'
      : state.isFocused ? 'rgba(39,129,138,0.15)' : 'transparent',
    color: 'var(--text-primary, #f1f5f9)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: '6px 10px',
  }),
  singleValue: base => ({ ...base, color: 'var(--text-primary, #f1f5f9)' }),
  input: base => ({ ...base, color: 'var(--text-primary, #f1f5f9)' }),
  placeholder: base => ({ ...base, color: 'var(--text-secondary, #94a3b8)' }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: base => ({ ...base, color: 'var(--text-secondary, #94a3b8)', padding: '0 8px' }),
  clearIndicator: base => ({ ...base, color: 'var(--text-secondary, #94a3b8)' }),
};

const FlagOption = ({ data, innerRef, innerProps, isSelected }: any) => (
  <div
    ref={innerRef}
    {...innerProps}
    style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '7px 10px', cursor: 'pointer', borderRadius: '6px',
      fontSize: '0.9rem', color: 'var(--text-primary, #f1f5f9)',
      background: isSelected ? 'var(--accent, #27818A)' : 'transparent',
    }}
    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(39,129,138,0.18)'; }}
    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
  >
    <ReactCountryFlag
      countryCode={data.code}
      svg
      style={{ width: '1.4em', height: '1.1em', borderRadius: '2px', objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 1px rgba(255,255,255,0.1)' }}
    />
    <span>{data.label}</span>
  </div>
);

const FlagSingleValue = ({ data }: any) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <ReactCountryFlag
      countryCode={data.code}
      svg
      style={{ width: '1.4em', height: '1.1em', borderRadius: '2px', objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' }}
    />
    <span style={{ color: 'var(--text-primary, #f1f5f9)' }}>{data.label}</span>
  </div>
);

export interface Project {
  id: string;
  clientName: string;
  clientNameAr?: string;
  projectValue: string;
  imageUrl: string;
  iconType: string;
  iconTypeAr?: string;
  customIconName?: string;
  categoryIconUrl?: string;
  country?: string;
  
  titleEn: string;
  summaryEn: string;
  locationEn: string;

  titleAr: string;
  summaryAr: string;
  locationAr: string;

  createdAt?: any;
}

const emptyProject: Partial<Project> = {
  clientName: '',
  clientNameAr: '',
  projectValue: '',
  imageUrl: '',
  iconType: '',
  iconTypeAr: '',
  customIconName: '',
  categoryIconUrl: '',
  country: '',
  titleEn: '', summaryEn: '', locationEn: '',
  titleAr: '', summaryAr: '', locationAr: ''
};

/* ── Icon Registry ──────────────────────────────────────────── */
const AVAILABLE_CUSTOM_ICONS: { name: string; group: string }[] = [
  { name: 'Factory',     group: 'Industrial' },
  { name: 'HardHat',     group: 'Industrial' },
  { name: 'Hammer',      group: 'Industrial' },
  { name: 'Wrench',      group: 'Industrial' },
  { name: 'Cog',         group: 'Industrial' },
  { name: 'Zap',         group: 'Energy' },
  { name: 'Fuel',        group: 'Energy' },
  { name: 'Flame',       group: 'Energy' },
  { name: 'Leaf',        group: 'Energy' },
  { name: 'Plug',        group: 'Energy' },
  { name: 'Lightbulb',   group: 'Energy' },
  { name: 'Landmark',    group: 'Infrastructure' },
  { name: 'Building',    group: 'Infrastructure' },
  { name: 'Store',       group: 'Infrastructure' },
  { name: 'Layers',      group: 'Infrastructure' },
  { name: 'Shield',      group: 'Defense' },
  { name: 'ShieldCheck', group: 'Defense' },
  { name: 'Droplets',    group: 'Water' },
  { name: 'Truck',       group: 'Transport' },
  { name: 'Train',       group: 'Transport' },
  { name: 'Server',      group: 'Tech & Health' },
  { name: 'Stethoscope', group: 'Tech & Health' },
  { name: 'Beaker',      group: 'Tech & Health' },
  { name: 'Activity',    group: 'Tech & Health' },
  { name: 'Package',     group: 'General' },
  { name: 'Box',         group: 'General' },
];

function renderIconByName(name: string, size = 20): React.ReactNode {
  switch (name) {
    case 'Factory':     return <Factory size={size} />;
    case 'HardHat':     return <HardHat size={size} />;
    case 'Hammer':      return <Hammer size={size} />;
    case 'Wrench':      return <Wrench size={size} />;
    case 'Cog':         return <Cog size={size} />;
    case 'Zap':         return <Zap size={size} />;
    case 'Fuel':        return <Fuel size={size} />;
    case 'Flame':       return <Flame size={size} />;
    case 'Leaf':        return <Leaf size={size} />;
    case 'Plug':        return <Plug size={size} />;
    case 'Lightbulb':   return <Lightbulb size={size} />;
    case 'Landmark':    return <Landmark size={size} />;
    case 'Building':    return <Building size={size} />;
    case 'Store':       return <Store size={size} />;
    case 'Layers':      return <Layers size={size} />;
    case 'Shield':      return <Shield size={size} />;
    case 'ShieldCheck': return <ShieldCheck size={size} />;
    case 'Droplets':    return <Droplets size={size} />;
    case 'Truck':       return <Truck size={size} />;
    case 'Train':       return <Train size={size} />;
    case 'Server':      return <Server size={size} />;
    case 'Stethoscope': return <Stethoscope size={size} />;
    case 'Beaker':      return <Beaker size={size} />;
    case 'Activity':    return <Activity size={size} />;
    case 'Package':     return <Package size={size} />;
    case 'Box':         return <Box size={size} />;
    default:            return <Building size={size} />;
  }
}

const ICON_GROUPS = Array.from(new Set(AVAILABLE_CUSTOM_ICONS.map(i => i.group)));

const IconPickerGrid: React.FC<{ value: string; onChange: (name: string) => void }> = ({ value, onChange }) => (
  <div className="icon-picker-wrap">
    {ICON_GROUPS.map(group => (
      <div key={group} className="icon-picker-group">
        <span className="icon-picker-group-label">{group}</span>
        <div className="icon-picker-row">
          {AVAILABLE_CUSTOM_ICONS.filter(i => i.group === group).map(({ name }) => (
            <button
              key={name}
              type="button"
              title={name}
              className={`icon-picker-btn${value === name ? ' selected' : ''}`}
              onClick={() => onChange(name)}
            >
              {renderIconByName(name, 20)}
              <span className="icon-picker-label">{name}</span>
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const IconGuidelinesBox: React.FC = () => (
  <div className="icon-guidelines">
    <p className="icon-guidelines-title">Icon guidelines</p>
    <ul className="icon-guidelines-list">
      <li>Use <strong>SVG format</strong> whenever possible — stays sharp at any size</li>
      <li>Keep icons <strong>simple and minimal</strong> — no text, labels, or complex logos</li>
      <li><strong>Transparent background</strong></li>
      <li><strong>Square aspect ratio (1:1)</strong> — recommended 512 × 512 px or higher</li>
      <li>Use a <strong>consistent style</strong> across all categories (outline or solid, not mixed)</li>
      <li>Ensure <strong>sufficient contrast</strong> so the icon remains visible on all backgrounds</li>
    </ul>
  </div>
);

/* ── CategoryPicker ──────────────────────────────────────────── */
interface CategoryPickerProps {
  value: string;
  options: string[];
  getCategoryLabel: (cat: string, lang: 'EN' | 'AR') => string;
  renderIcon: (cat: string) => React.ReactNode;
  onChange: (val: string) => void;
}

const CategoryPicker: React.FC<CategoryPickerProps> = ({ value, options, getCategoryLabel, renderIcon, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.65rem 1rem', background: 'var(--bg-tertiary)',
          border: open ? '1px solid var(--accent-teal)' : '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)', cursor: 'pointer',
          color: value ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: '0.9rem', textAlign: 'left', transition: 'border-color 0.15s',
          boxShadow: open ? '0 0 0 2px var(--accent-teal-light)' : 'none',
        }}
      >
        {value && value !== 'Custom' && (
          <span style={{ color: 'var(--accent-teal)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {renderIcon(value)}
          </span>
        )}
        <span style={{ flex: 1 }}>
          {value && value !== 'Custom'
            ? `${getCategoryLabel(value, 'EN')}  •  ${getCategoryLabel(value, 'AR')}`
            : value === 'Custom' ? '+ Add New Category...' : 'Select a category'}
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: 'auto' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
              zIndex: 999, maxHeight: '260px', overflowY: 'auto',
              padding: '0.35rem',
            }}
          >
            {options.length === 0 && (
              <div style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No categories yet — add one below.
              </div>
            )}
            {options.map(cat => {
              const isActive = cat === value;
              const labelEn = getCategoryLabel(cat, 'EN');
              const labelAr = getCategoryLabel(cat, 'AR');
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { onChange(cat); setOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.6rem 0.85rem', borderRadius: '8px', border: 'none',
                    background: isActive ? 'var(--accent-teal-light)' : 'transparent',
                    color: isActive ? 'var(--accent-teal)' : 'var(--text-primary)',
                    cursor: 'pointer', textAlign: 'left', fontSize: '0.9rem',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, width: '24px', justifyContent: 'center' }}>
                    {renderIcon(cat)}
                  </span>
                  <span style={{ flex: 1, fontWeight: isActive ? 600 : 400 }}>{labelEn}</span>
                  {labelAr !== labelEn && (
                    <span style={{ direction: 'rtl', color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'Arial, sans-serif' }}>
                      {labelAr}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Add new option */}
            <button
              type="button"
              onClick={() => { onChange('Custom'); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.6rem 0.85rem', marginTop: '0.25rem',
                borderTop: '1px solid var(--border-color)',
                borderRadius: '0 0 8px 8px', border: 'none',
                background: 'transparent', color: 'var(--accent-teal)',
                cursor: 'pointer', textAlign: 'left', fontSize: '0.9rem',
                fontWeight: 600, transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-teal-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Plus size={16} />
              Add New Category...
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PAGE_SIZE = 10; // 5 rows × 2 columns

export const ProjectManagement: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const [viewMode, setViewMode] = useState<'LIST' | 'EDIT'>('LIST');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mode = params.get('mode');
    if (mode === 'edit') {
      setViewMode('EDIT');
    } else {
      setViewMode('LIST');
    }
  }, [location.search]);

  const [currentLang, setCurrentLang] = useState<'EN' | 'AR'>('EN');
  const [formData, setFormData] = useState<Partial<Project>>(emptyProject);
  const [addingNewCat, setAddingNewCat] = useState(false);
  const [editCatData, setEditCatData] = useState<{oldNameEn: string, oldNameAr: string, oldIconName: string, oldIconUrl: string, nameEn: string, nameAr: string, iconName: string, iconUrl: string} | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImg, setIsUploadingImg] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [showBuiltinPicker, setShowBuiltinPicker] = useState(false);

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
    const q = query(collection(db, 'projects'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Project[] = [];
      snapshot.forEach(d => {
        docs.push({ id: d.id, ...d.data() } as Project);
      });
      docs.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });
      setProjects(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenEditor = (proj?: Project) => {
    if (proj) {
      setFormData(proj);
    } else {
      setFormData(emptyProject);
    }
    setAddingNewCat(false);
    setCurrentLang('EN');
    navigate('?mode=edit');
  };

  const handleCloseEditor = () => {
    setFormData(emptyProject);
    setAddingNewCat(false);
    navigate(location.pathname);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsUploadingImg(true);
      try {
        const prepared = await prepareImage(file, MAX_EDGE.card);
        const storageRef = ref(storage, `project_covers/${Date.now()}_${prepared.name}`);
        const uploadTask = uploadBytesResumable(storageRef, prepared, UPLOAD_METADATA);
        
        uploadTask.on(
          "state_changed",
          null,
          (error) => {
            console.error("Upload failed:", error);
            setIsUploadingImg(false);
            showAlert("Upload Failed", "Image upload failed.", "danger");
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

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>, onSuccess: (url: string) => void) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsUploadingIcon(true);
    try {
      // This input accepts SVG; prepareImage passes vector formats through untouched.
      const prepared = await prepareImage(file, MAX_EDGE.logo, 0.92);
      const storageRef = ref(storage, `category_icons/${Date.now()}_${prepared.name}`);
      const uploadTask = uploadBytesResumable(storageRef, prepared, UPLOAD_METADATA);
      uploadTask.on('state_changed', null,
        (err) => { console.error('Icon upload failed:', err); setIsUploadingIcon(false); showAlert('Upload Failed', 'Icon image upload failed.', 'danger'); },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          onSuccess(url);
          setIsUploadingIcon(false);
        }
      );
    } catch (err) {
      setIsUploadingIcon(false);
      showAlert('Error', 'An error occurred starting the icon upload.', 'danger');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.titleEn?.trim() || !formData.summaryEn?.trim() || !formData.locationEn?.trim() || !formData.clientName?.trim()) {
      showAlert("Missing Fields", "Please ensure all English fields (Title, Client, Summary, Location) are filled.", "warning");
      return;
    }
    if (!formData.titleAr?.trim() || !formData.summaryAr?.trim() || !formData.locationAr?.trim() || !formData.clientNameAr?.trim()) {
      showAlert("Missing Arabic Content", "Arabic layout is compulsory. Please switch to the Arabic layout tab and fill out the fields.", "warning");
      return;
    }
    if (!formData.iconType?.trim()) {
      showAlert("Missing Category", "Please select or create a project category.", "warning");
      return;
    }
    if (!formData.imageUrl) {
      showAlert("Missing Image", "Please upload a project cover image.", "warning");
      return;
    }

    setIsSaving(true);
    try {
      if (formData.id) {
        await setDoc(doc(db, 'projects', formData.id), { ...formData }, { merge: true });
      } else {
        await addDoc(collection(db, 'projects'), { ...formData, createdAt: serverTimestamp() });
      }

      // Upsert to project_categories collection
      if (formData.iconType?.trim()) {
        const catId = formData.iconType.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase();
        await setDoc(doc(db, 'project_categories', catId), {
          nameEn: formData.iconType,
          nameAr: formData.iconTypeAr || getCategoryLabel(formData.iconType, 'AR'),
          iconName: formData.customIconName || '',
          iconUrl: formData.categoryIconUrl || ''
        }, { merge: true }).catch(e => {
          console.error("Could not update project_categories due to permissions", e);
        });
      }

      handleCloseEditor();
      showAlert("Success", "Project saved successfully.", "success");
    } catch (err) {
      console.error("Error saving document: ", err);
      showAlert("Error", "Failed to save project.", "danger");
    }
    setIsSaving(false);
  };

  const handleDelete = (id: string, title: string) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Project',
      message: `Are you sure you want to delete project "${title}"? This cannot be undone.`,
      confirmText: 'Delete',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await deleteDoc(doc(db, 'projects', id));
          showAlert("Deleted", "Project has been removed.", "success");
        } catch (err) {
          console.error("Error deleting document: ", err);
          showAlert("Error", "Failed to delete project.", "danger");
        }
      }
    });
  };

  const handleDeleteCategory = (catToDelete: string) => {
    setAlertConfig({
      isOpen: true,
      type: 'danger',
      title: 'Delete Category',
      message: `Are you sure you want to delete the category "${catToDelete}" globally? All projects using it will have their category cleared.`,
      confirmText: 'Delete Category',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          const projsToUpdate = projects.filter(p => p.iconType === catToDelete);
          const updatePromises = projsToUpdate.map(p => 
            setDoc(doc(db, 'projects', p.id), { iconType: '', iconTypeAr: '', customIconName: '', categoryIconUrl: '' }, { merge: true })
          );
          await Promise.all(updatePromises);

          const catId = catToDelete.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase();
          await deleteDoc(doc(db, 'project_categories', catId)).catch(e => console.error("Could not delete from project_categories", e));
          
          if (formData.iconType === catToDelete) {
             setFormData(prev => ({ ...prev, iconType: '', iconTypeAr: '', customIconName: '' }));
          }
          showAlert("Deleted", `Category "${catToDelete}" has been deleted globally.`, "success");
        } catch (err) {
          console.error("Error deleting category: ", err);
          showAlert("Error", "Failed to delete category.", "danger");
        }
      }
    });
  };

  const handleEditCategory = (catName: string) => {
    const proj = projects.find(p => p.iconType === catName);
    const initialEn = getCategoryLabel(catName, 'EN');
    const initialAr = proj?.iconTypeAr || getCategoryLabel(catName, 'AR');
    const initialIcon = proj?.customIconName || '';
    const initialIconUrl = proj?.categoryIconUrl || '';

    setEditCatData({
      oldNameEn: catName,
      oldNameAr: initialAr,
      oldIconName: initialIcon,
      oldIconUrl: initialIconUrl,
      nameEn: initialEn,
      nameAr: initialAr,
      iconName: initialIcon,
      iconUrl: initialIconUrl,
    });
  };

  const saveCategoryEdit = async () => {
    if (!editCatData || !editCatData.nameEn.trim()) {
      showAlert("Missing Fields", "Category Name (English) is required.", "warning");
      return;
    }
    
    setIsSaving(true);
    try {
      const projsToUpdate = projects.filter(p => p.iconType === editCatData.oldNameEn);
      
      const updatePromises = projsToUpdate.map(p =>
        setDoc(doc(db, 'projects', p.id), {
          iconType: editCatData.nameEn,
          iconTypeAr: editCatData.nameAr || editCatData.nameEn,
          customIconName: editCatData.iconName,
          categoryIconUrl: editCatData.iconUrl,
        }, { merge: true })
      );
      await Promise.all(updatePromises);

      // Update project_categories
      const oldCatId = editCatData.oldNameEn.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase();
      const newCatId = editCatData.nameEn.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase();

      if (oldCatId !== newCatId) {
        await deleteDoc(doc(db, 'project_categories', oldCatId)).catch(e => console.error(e));
      }

      await setDoc(doc(db, 'project_categories', newCatId), {
        nameEn: editCatData.nameEn,
        nameAr: editCatData.nameAr || editCatData.nameEn,
        iconName: editCatData.iconName,
        iconUrl: editCatData.iconUrl,
      }, { merge: true }).catch(e => {
        console.error("Could not update project_categories due to permissions", e);
      });

      if (formData.iconType === editCatData.oldNameEn) {
        setFormData(prev => ({
          ...prev,
          iconType: editCatData.nameEn,
          iconTypeAr: editCatData.nameAr || editCatData.nameEn,
          customIconName: editCatData.iconName,
          categoryIconUrl: editCatData.iconUrl,
        }));
      }

      setEditCatData(null);
      showAlert("Success", "Category updated globally.", "success");
    } catch (err: any) {
      console.error("Error updating category: ", err);
      showAlert("Error", `Failed to update category. Details: ${err.message || err}`, "danger");
    }
    setIsSaving(false);
  };

  const renderIcon = (type: string, customIconName?: string, categoryIconUrl?: string) => {
    if (categoryIconUrl) return <img src={categoryIconUrl} alt={type} className="category-icon-img" />;
    if (customIconName) return renderIconByName(customIconName, 24);

    switch (type) {
      case 'Industrial':                  return <Factory size={24} />;
      case 'Infrastructure & Government': return <Landmark size={24} />;
      case 'Commercial Developments':     return <Store size={24} />;
      case 'Defense & Institutional':     return <ShieldCheck size={24} />;
      case 'Water & Utilities':           return <Droplets size={24} />;
      case 'Oil & Gas':                   return <Fuel size={24} />;
      case 'Energy & Power':              return <Zap size={24} />;
      case 'Transportation & Rail':       return <Train size={24} />;
      case 'Healthcare & Laboratories':   return <Stethoscope size={24} />;
      case 'Data Centers & Technology':   return <Server size={24} />;
      case 'Renewable Energy':            return <Leaf size={24} />;
      case 'Construction / EPC Support':  return <HardHat size={24} />;
      // Legacy names
      case 'Chemical':
      case 'Chemical / Processing':       return <Beaker size={24} />;
      case 'Energy':
      case 'Energy / Power':              return <Zap size={24} />;
      case 'Construction':
      case 'Construction / Heavy':        return <Building size={24} />;
      case 'Pipeline':
      case 'Pipeline / Water':            return <Droplets size={24} />;
      default: {
        const ref = projects.find(p => p.iconType === type && p.customIconName);
        if (ref && ref.customIconName) return renderIcon(type, ref.customIconName);
        return <Building size={24} />;
      }
    }
  };

  const allKnownCats = Array.from(new Set(
    projects.map(p => p.iconType).filter(t => t && t.trim() !== '' && t !== 'Uncategorized')
  ));

  const getCategoryLabel = (cat: string, lang: 'EN' | 'AR' = 'EN') => {
    if (lang === 'AR') {
      const projWithAr = projects.find(p => p.iconType === cat && p.iconTypeAr);
      if (projWithAr?.iconTypeAr) return projWithAr.iconTypeAr;

      switch (cat) {
        case 'Chemical':
        case 'Chemical / Processing': return 'كيميائي / معالجة';
        case 'Energy':
        case 'Energy / Power': return 'طاقة / قوى';
        case 'Construction':
        case 'Construction / Heavy': return 'بناء / ثقيل';
        case 'Pipeline':
        case 'Pipeline / Water': return 'خطوط أنابيب / مياه';
        default: return cat;
      }
    }

    switch (cat) {
      case 'Chemical':
      case 'Chemical / Processing': return 'Chemical / Processing';
      case 'Energy':
      case 'Energy / Power': return 'Energy / Power';
      case 'Construction':
      case 'Construction / Heavy': return 'Construction / Heavy';
      case 'Pipeline':
      case 'Pipeline / Water': return 'Pipeline / Water';
      default: return cat;
    }
  };

  return (
    <motion.div 
      className="project-section"
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

      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '2rem', marginBottom: '0.5rem' }}>Portfolio Projects</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage the high-performance projects displayed on the frontend.</p>
        </div>
        {viewMode === 'LIST' && (
          <button className="btn btn-primary" onClick={() => handleOpenEditor()}>
            <Plus size={18} />
            <span>Add Project</span>
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
              <h2 className="text-xl font-bold">{formData.id ? 'Edit Project' : 'Create New Project'}</h2>
              <button className="btn-close" onClick={handleCloseEditor} type="button">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="form-section-global">
                <h3 className="section-label">Global Configuration</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Project Value</label>
                    <input type="text" name="projectValue" value={formData.projectValue || ''} onChange={handleChange} placeholder="e.g. $4.1M" required />
                  </div>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label style={{ margin: 0 }}>Project Category</label>
                      {allKnownCats.includes(formData.iconType || '') && !editCatData && (
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button 
                            type="button" 
                            onClick={() => handleEditCategory(formData.iconType!)}
                            style={{
                              background: 'none', border: 'none', color: 'var(--accent-teal)', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', padding: 0
                            }}
                            title="Edit this category globally"
                          >
                            <Edit2 size={14} /> Edit '{formData.iconType}'
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleDeleteCategory(formData.iconType!)}
                            style={{
                              background: 'none', border: 'none', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', padding: 0
                            }}
                            title="Delete this category globally"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {editCatData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--accent-teal)' }}>
                           <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Edit Category (Global)</h4>
                           <div style={{ display: 'flex', gap: '0.5rem' }}>
                             <input 
                                type="text" 
                                value={editCatData.nameEn} 
                                onChange={e => setEditCatData(prev => prev ? {...prev, nameEn: e.target.value} : null)}
                                placeholder="Category Name (English)"
                                style={{ flex: 1 }}
                             />
                             <input 
                                type="text" 
                                value={editCatData.nameAr} 
                                onChange={e => setEditCatData(prev => prev ? {...prev, nameAr: e.target.value} : null)}
                                placeholder="اسم الفئة (Arabic)"
                                style={{ flex: 1, direction: 'rtl' }}
                             />
                           </div>
                           <div>
                             <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'block' }}>Category Icon</label>
                             {isUploadingIcon ? (
                               <div className="icon-uploading">
                                 <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} color="var(--accent-teal)" />
                                 <span>Uploading icon...</span>
                               </div>
                             ) : editCatData.iconUrl ? (
                               <div className="icon-upload-preview">
                                 <img src={editCatData.iconUrl} alt="icon" />
                                 <div>
                                   <p className="icon-preview-note">This icon will show on all projects in this category and on the main website.</p>
                                   <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                                     onClick={() => setEditCatData(prev => prev ? { ...prev, iconUrl: '' } : null)}>
                                     Replace Icon
                                   </button>
                                 </div>
                               </div>
                             ) : (
                               <>
                                 <button type="button" className="builtin-toggle" onClick={() => setShowBuiltinPicker(p => !p)}>
                                   {editCatData.iconName ? (
                                     <span className="builtin-current">
                                       {renderIconByName(editCatData.iconName, 14)}
                                       {editCatData.iconName}
                                     </span>
                                   ) : 'Choose a built-in icon'}
                                   <ChevronDown size={13} className={showBuiltinPicker ? 'builtin-chevron-open' : 'builtin-chevron'} />
                                 </button>
                                 {showBuiltinPicker && (
                                   <IconPickerGrid
                                     value={editCatData.iconName}
                                     onChange={name => setEditCatData(prev => prev ? { ...prev, iconName: name === prev.iconName ? '' : name } : null)}
                                   />
                                 )}
                                 <label className="icon-upload-btn" style={{ marginTop: '0.4rem' }}>
                                   <Upload size={15} />
                                   Or upload a custom icon (PNG, SVG, WebP)
                                   <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" style={{ display: 'none' }}
                                     onChange={e => handleIconUpload(e, url => setEditCatData(prev => prev ? { ...prev, iconUrl: url } : null))} />
                                 </label>
                                 <IconGuidelinesBox />
                               </>
                             )}
                           </div>
                           <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                              <button 
                                type="button" 
                                className="btn btn-primary" 
                                onClick={saveCategoryEdit} 
                                style={{ flex: 1, padding: '0.4rem', fontSize: '0.85rem' }} 
                                disabled={isSaving || (editCatData.nameEn === editCatData.oldNameEn && editCatData.nameAr === editCatData.oldNameAr && editCatData.iconName === editCatData.oldIconName && editCatData.iconUrl === editCatData.oldIconUrl)}
                              >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                              </button>
                              <button type="button" className="btn btn-secondary" onClick={() => setEditCatData(null)} style={{ flex: 1, padding: '0.4rem', fontSize: '0.85rem' }} disabled={isSaving}>Cancel</button>
                           </div>
                        </div>
                      ) : (
                        <>
                          {/* Custom Category Picker */}
                          <div style={{ position: 'relative' }}>
                            <CategoryPicker
                              value={addingNewCat ? 'Custom' : (formData.iconType || '')}
                              options={allKnownCats}
                              getCategoryLabel={getCategoryLabel}
                              renderIcon={(cat: string) => { const p = projects.find(pr => pr.iconType === cat); return renderIcon(cat, p?.customIconName, p?.categoryIconUrl); }}
                              onChange={(val) => {
                                if (val === 'Custom') {
                                  setAddingNewCat(true);
                                  setFormData(prev => ({ ...prev, iconType: '', iconTypeAr: '', customIconName: '' }));
                                } else {
                                  setAddingNewCat(false);
                                  const proj = projects.find(p => p.iconType === val);
                                  const initialAr = proj?.iconTypeAr || getCategoryLabel(val, 'AR');
                                  const initialIcon = proj?.customIconName || '';
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    iconType: val,
                                    iconTypeAr: initialAr,
                                    customIconName: initialIcon
                                  }));
                                }
                              }}
                            />
                          </div>

                          {addingNewCat && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input 
                                  type="text" 
                                  name="iconType" 
                                  value={formData.iconType || ''} 
                                  onChange={handleChange}
                                  placeholder="Category Name (English)"
                                  autoFocus
                                  required
                                  style={{ flex: 1 }}
                                />
                                <input 
                                  type="text" 
                                  name="iconTypeAr" 
                                  value={formData.iconTypeAr || ''} 
                                  onChange={handleChange}
                                  placeholder="اسم الفئة (Arabic)"
                                  required
                                  style={{ flex: 1, direction: 'rtl' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'block' }}>Category Icon</label>
                                {isUploadingIcon ? (
                                  <div className="icon-uploading">
                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} color="var(--accent-teal)" />
                                    <span>Uploading icon...</span>
                                  </div>
                                ) : formData.categoryIconUrl ? (
                                  <div className="icon-upload-preview">
                                    <img src={formData.categoryIconUrl} alt="icon" />
                                    <div>
                                      <p className="icon-preview-note">This icon will show on all projects in this category and on the main website.</p>
                                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
                                        onClick={() => setFormData(prev => ({ ...prev, categoryIconUrl: '' }))}>
                                        Replace Icon
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <button type="button" className="builtin-toggle" onClick={() => setShowBuiltinPicker(p => !p)}>
                                      {formData.customIconName ? (
                                        <span className="builtin-current">
                                          {renderIconByName(formData.customIconName, 14)}
                                          {formData.customIconName}
                                        </span>
                                      ) : 'Choose a built-in icon'}
                                      <ChevronDown size={13} className={showBuiltinPicker ? 'builtin-chevron-open' : 'builtin-chevron'} />
                                    </button>
                                    {showBuiltinPicker && (
                                      <IconPickerGrid
                                        value={formData.customIconName || ''}
                                        onChange={name => setFormData(prev => ({ ...prev, customIconName: name === prev.customIconName ? '' : name }))}
                                      />
                                    )}
                                    <label className="icon-upload-btn" style={{ marginTop: '0.4rem' }}>
                                      <Upload size={15} />
                                      Or upload a custom icon (PNG, SVG, WebP)
                                      <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" style={{ display: 'none' }}
                                        onChange={e => handleIconUpload(e, url => setFormData(prev => ({ ...prev, categoryIconUrl: url })))} />
                                    </label>
                                    <IconGuidelinesBox />
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="form-group full-width">
                    <label>Cover Image (Required)</label>
                    <div className="img-input-wrap">
                      {isUploadingImg ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.85rem' }}>
                          <Loader2 size={18} className="spin" color="var(--accent-teal)" style={{ animation: 'spin 1s linear infinite' }} /> 
                          <span style={{ color: 'var(--text-secondary)' }}>Uploading image...</span>
                        </div>
                      ) : formData.imageUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                          <img src={formData.imageUrl} alt="Cover Preview" style={{ width: '120px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => setFormData(prev => ({...prev, imageUrl: ''}))}>Remove Image</button>
                        </div>
                      ) : (
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ paddingLeft: '0.85rem' }} />
                      )}
                    </div>
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
                    <label>{currentLang === 'EN' ? 'Client / Company Name' : 'Client / Company Name (Arabic)'}</label>
                    <input 
                      type="text" 
                      name={currentLang === 'EN' ? 'clientName' : 'clientNameAr'} 
                      value={(currentLang === 'EN' ? formData.clientName : formData.clientNameAr) || ''} 
                      onChange={handleChange} 
                      className={currentLang === 'AR' ? 'rtl-input' : ''}
                      placeholder={currentLang === 'EN' ? 'e.g. SABIC' : ''}
                      required 
                    />
                  </div>
                  <div className="form-group full-width">
                    <label>{currentLang === 'EN' ? 'Project Title' : 'Project Title (Arabic)'}</label>
                    <input 
                      type="text" 
                      name={currentLang === 'EN' ? 'titleEn' : 'titleAr'} 
                      value={(currentLang === 'EN' ? formData.titleEn : formData.titleAr) || ''} 
                      onChange={handleChange} 
                      className={currentLang === 'AR' ? 'rtl-input' : ''}
                      required 
                    />
                  </div>
                  <div className="form-group full-width">
                    <label>Country</label>
                    <Select<CountryOption>
                      options={countryOptions}
                      value={countryOptions.find(o => o.value === (formData.country || '')) || null}
                      onChange={opt => setFormData(prev => ({ ...prev, country: opt?.value || '' }))}
                      placeholder="Search & select country…"
                      isClearable
                      isSearchable
                      styles={countrySelectStyles}
                      components={{ Option: FlagOption, SingleValue: FlagSingleValue }}
                      menuPlacement="auto"
                      classNamePrefix="country-select"
                    />
                  </div>
                  <div className="form-group full-width">
                    <label>{currentLang === 'EN' ? 'Location' : 'Location (Arabic)'}</label>
                    <input 
                      type="text" 
                      name={currentLang === 'EN' ? 'locationEn' : 'locationAr'} 
                      value={(currentLang === 'EN' ? formData.locationEn : formData.locationAr) || ''} 
                      onChange={handleChange} 
                      className={currentLang === 'AR' ? 'rtl-input' : ''}
                      placeholder={currentLang === 'EN' ? 'e.g. Jubail' : ''}
                      required 
                    />
                  </div>
                  <div className="form-group full-width">
                    <label>{currentLang === 'EN' ? 'Project Summary' : 'Project Summary (Arabic)'}</label>
                    <textarea 
                      name={currentLang === 'EN' ? 'summaryEn' : 'summaryAr'} 
                      value={(currentLang === 'EN' ? formData.summaryEn : formData.summaryAr) || ''} 
                      onChange={handleChange} 
                      className={`short-textarea ${currentLang === 'AR' ? 'rtl-input' : ''}`}
                      required 
                    />
                  </div>
                </div>
              </div>

              <div className="editor-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseEditor} disabled={isSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSaving || isUploadingImg}>
                  {isSaving ? 'Saving...' : 'Save Project to Database'}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="panel project-search-bar">
              <div className="blog-search-wrap">
                <Search size={15} className="blog-search-icon" />
                <input
                  type="text"
                  className="blog-search-input"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                />
                {searchQuery && (
                  <button className="blog-search-clear" onClick={() => { setSearchQuery(''); setCurrentPage(1); }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading projects...</div>
            ) : (() => {
              const q = searchQuery.trim().toLowerCase();
              const filtered = q
                ? projects.filter(p =>
                    p.titleEn?.toLowerCase().includes(q) ||
                    p.titleAr?.toLowerCase().includes(q) ||
                    p.clientName?.toLowerCase().includes(q) ||
                    p.clientNameAr?.toLowerCase().includes(q) ||
                    p.locationEn?.toLowerCase().includes(q) ||
                    p.country?.toLowerCase().includes(q) ||
                    p.iconType?.toLowerCase().includes(q)
                  )
                : projects;

              if (filtered.length === 0) return (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  {q ? `No projects found for "${searchQuery}".` : 'No projects found. Add one above!'}
                </div>
              );

              const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
              const pagedProjects = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
              return (
                <>
                  <div className="project-grid">
                    {pagedProjects.map(proj => (
                      <div key={proj.id} className="project-card" onClick={() => handleOpenEditor(proj)}>
                        <div className="card-admin-overlay">
                          <button className="admin-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenEditor(proj); }} title="Edit Project">
                            <Edit2 size={16} />
                          </button>
                          <button className="admin-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(proj.id, proj.titleEn); }} title="Delete Project">
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div className="project-img-wrapper">
                          {proj.imageUrl && <img src={proj.imageUrl} alt={proj.titleEn} />}
                          <div className="project-img-overlay">
                            <div className="project-icon-box">
                              {renderIcon(proj.iconType, proj.customIconName, proj.categoryIconUrl)}
                            </div>
                            <div className="project-img-titles">
                              <span className="project-client-name">{proj.clientName}</span>
                              <h3 className="project-card-title">{proj.titleEn}</h3>
                            </div>
                          </div>
                        </div>

                        <div className="project-card-body">
                          <p className="project-summary">{proj.summaryEn}</p>
                          <div className="project-card-footer">
                            <div className="project-meta-col">
                              <span className="project-meta-label">Project Value</span>
                              <span className="project-meta-value">{proj.projectValue}</span>
                            </div>
                            <div className="project-meta-col" style={{ textAlign: 'left', flex: 1 }}>
                              <span className="project-meta-label">Location</span>
                              <div className="project-meta-value-group">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                                  <MapPin size={14} color="#27818A" style={{ flexShrink: 0 }} />
                                  <span style={{ fontSize: '0.95rem' }}>{proj.locationEn}</span>
                                </div>
                                {proj.country && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '2px' }}>
                                    <ReactCountryFlag
                                      countryCode={getCountryCode(proj.country) || ''}
                                      svg
                                      style={{ width: '1.2em', height: '0.9em', borderRadius: '1px', flexShrink: 0 }}
                                    />
                                    <span style={{ opacity: 0.8, fontSize: '0.85rem', fontWeight: 500 }}>{proj.country}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="project-pagination">
                      <button
                        className="btn btn-secondary pagination-btn"
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft size={16} />
                        Previous
                      </button>
                      <span className="pagination-info">
                        Page {currentPage} of {totalPages}
                        <span className="pagination-count"> &mdash; {filtered.length} projects</span>
                      </span>
                      <button
                        className="btn btn-secondary pagination-btn"
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage === totalPages}
                      >
                        Next
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
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
