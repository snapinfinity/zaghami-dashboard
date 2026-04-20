import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Edit2, Trash2, ArrowLeft, X, Loader2, Beaker, Zap, Building, Droplets,
  Factory, Cog, Wrench, Shield, ShieldCheck, Flame, Hammer, Truck, Package, Plug, Lightbulb, Activity, Layers, Box, MapPin
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
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
  customIconName?: string;
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
  customIconName: '',
  country: '',
  titleEn: '', summaryEn: '', locationEn: '',
  titleAr: '', summaryAr: '', locationAr: ''
};

export const ProjectManagement: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  
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
    setCurrentLang('EN');
    navigate('?mode=edit');
  };

  const handleCloseEditor = () => {
    setFormData(emptyProject);
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
        const storageRef = ref(storage, `project_covers/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
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
      message: `Are you sure you want to delete the category "${catToDelete}" globally? All projects using this category will become "Uncategorized".`,
      confirmText: 'Delete Category',
      showCancel: true,
      onConfirm: async () => {
        closeAlert();
        try {
          const projsToUpdate = projects.filter(p => p.iconType === catToDelete);
          const updatePromises = projsToUpdate.map(p => 
            setDoc(doc(db, 'projects', p.id), { iconType: 'Uncategorized', customIconName: '' }, { merge: true })
          );
          await Promise.all(updatePromises);
          
          if (formData.iconType === catToDelete) {
             setFormData(prev => ({ ...prev, iconType: 'Uncategorized', customIconName: '' }));
          }
          showAlert("Deleted", `Category "${catToDelete}" has been deleted globally.`, "success");
        } catch (err) {
          console.error("Error deleting category: ", err);
          showAlert("Error", "Failed to delete category.", "danger");
        }
      }
    });
  };

  const renderIcon = (type: string, customIconName?: string) => {
    if (customIconName) {
      switch (customIconName) {
        case 'Factory': return <Factory size={24} />;
        case 'Cog': return <Cog size={24} />;
        case 'Wrench': return <Wrench size={24} />;
        case 'Hammer': return <Hammer size={24} />;
        case 'Zap': return <Zap size={24} />;
        case 'Plug': return <Plug size={24} />;
        case 'Lightbulb': return <Lightbulb size={24} />;
        case 'Shield': return <Shield size={24} />;
        case 'ShieldCheck': return <ShieldCheck size={24} />;
        case 'Activity': return <Activity size={24} />;
        case 'Beaker': return <Beaker size={24} />;
        case 'Droplets': return <Droplets size={24} />;
        case 'Flame': return <Flame size={24} />;
        case 'Truck': return <Truck size={24} />;
        case 'Package': return <Package size={24} />;
        case 'Box': return <Box size={24} />;
        case 'Layers': return <Layers size={24} />;
        case 'Building': return <Building size={24} />;
      }
    }

    switch (type) {
      case 'Chemical': return <Beaker size={24} />;
      case 'Energy': return <Zap size={24} />;
      case 'Construction': return <Building size={24} />;
      case 'Pipeline': return <Droplets size={24} />;
      default: 
        const ref = projects.find(p => p.iconType === type && p.customIconName);
        if (ref && ref.customIconName) return renderIcon(type, ref.customIconName);
        return <Building size={24} />;
    }
  };

  const AVAILABLE_CUSTOM_ICONS = [
    'Factory', 'Cog', 'Wrench', 'Hammer',
    'Zap', 'Plug', 'Lightbulb',
    'Shield', 'ShieldCheck', 'Activity',
    'Beaker', 'Droplets', 'Flame',
    'Truck', 'Package', 'Box', 'Layers', 'Building'
  ];

  const allKnownCats = Array.from(new Set(projects.map(p => p.iconType).filter(Boolean)));
  const isCustomSelected = formData.iconType !== undefined && !allKnownCats.includes(formData.iconType);

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'Chemical': return 'Chemical / Processing';
      case 'Energy': return 'Energy / Power';
      case 'Construction': return 'Construction / Heavy';
      case 'Pipeline': return 'Pipeline / Water';
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
                      {allKnownCats.includes(formData.iconType || '') && formData.iconType !== 'Uncategorized' && (
                        <button 
                          type="button" 
                          onClick={() => handleDeleteCategory(formData.iconType!)}
                          style={{
                            background: 'none', border: 'none', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', padding: 0
                          }}
                          title="Delete this category globally"
                        >
                          <Trash2 size={14} /> Delete '{formData.iconType}'
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <select 
                        value={isCustomSelected ? 'Custom' : formData.iconType} 
                        onChange={(e) => {
                          if (e.target.value === 'Custom') {
                            setFormData(prev => ({ ...prev, iconType: '' }));
                          } else {
                            setFormData(prev => ({ ...prev, iconType: e.target.value }));
                          }
                        }}
                      >
                        <option value="" disabled>Select a category</option>
                        {allKnownCats.map(cat => (
                          <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
                        ))}
                        <option value="Custom">+ Add New Category...</option>
                      </select>
                      
                      {isCustomSelected && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input 
                            type="text" 
                            name="iconType" 
                            value={formData.iconType || ''} 
                            onChange={handleChange}
                            placeholder="Type new category name"
                            autoFocus
                            required
                            style={{ flex: 1 }}
                          />
                          <select 
                            name="customIconName" 
                            value={formData.customIconName || ''} 
                            onChange={handleChange}
                            style={{ flex: 1 }}
                          >
                            <option value="">Default Icon</option>
                            {AVAILABLE_CUSTOM_ICONS.map(icon => (
                              <option key={icon} value={icon}>{icon} Icon</option>
                            ))}
                          </select>
                        </div>
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
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading projects...</div>
            ) : projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No projects found. Add one above!</div>
            ) : (
              <div className="project-grid">
                {projects.map(proj => (
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
                          {renderIcon(proj.iconType, proj.customIconName)}
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
