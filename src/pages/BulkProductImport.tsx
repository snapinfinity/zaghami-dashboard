import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Loader2, UploadCloud, FileSpreadsheet, Download, Images,
  AlertTriangle, CheckCircle2, ArrowLeft, ArrowRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { prepareImage, MAX_EDGE, UPLOAD_METADATA } from '../lib/uploadImage';
import type { ProductCategory, SubcategoryNode } from './ProductCategories';
import type { Product } from './ProductManagement';
import './BulkProductImport.css';

/* ─── Sheet contract ─────────────────────────────────────────────── */
/**
 * Column headers written into the downloadable template. Reading is lenient
 * (see HEADER_ALIASES), so a sheet exported from Excel, Numbers or Sheets
 * still maps correctly even if the casing or punctuation drifts.
 */
const TEMPLATE_HEADERS = [
  'Category',
  'Subcategory',
  'Name (English)',
  'Name (Arabic)',
  'Description (English)',
  'Description (Arabic)',
  'Keywords',
  'Slug',
  'Image URL',
  'Image File',
] as const;

type FieldKey =
  | 'category' | 'subcategory' | 'nameEn' | 'nameAr' | 'descriptionEn'
  | 'descriptionAr' | 'keywords' | 'slug' | 'imageUrl' | 'imageFile';

/** Normalised header text → field. Keys are lowercase alphanumerics only. */
const HEADER_ALIASES: Record<string, FieldKey> = {
  category: 'category', parentcategory: 'category', categoryen: 'category',
  subcategory: 'subcategory', subcat: 'subcategory', subcategoryen: 'subcategory',
  nameenglish: 'nameEn', nameen: 'nameEn', productnameenglish: 'nameEn', productname: 'nameEn', name: 'nameEn',
  namearabic: 'nameAr', namear: 'nameAr', productnamearabic: 'nameAr', arabicname: 'nameAr',
  descriptionenglish: 'descriptionEn', descriptionen: 'descriptionEn', description: 'descriptionEn',
  descriptionarabic: 'descriptionAr', descriptionar: 'descriptionAr', arabicdescription: 'descriptionAr',
  keywords: 'keywords', tags: 'keywords',
  slug: 'slug', urlslug: 'slug',
  imageurl: 'imageUrl', image: 'imageUrl', imagelink: 'imageUrl',
  imagefile: 'imageFile', imagefilename: 'imageFile', filename: 'imageFile',
};

const normaliseHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Already in our Storage bucket — the only host the website will serve. */
const isStorageUrl = (url: string) => /^https:\/\/firebasestorage\.googleapis\.com\//i.test(url);
const isExternalUrl = (url: string) => Boolean(url) && !isStorageUrl(url);

const generateSlug = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* ─── Category resolution ────────────────────────────────────────── */
interface FlatSubcat {
  id: string;
  nameEn: string;
  nameAr: string;
  /** Full path from the root, e.g. "Cables > Low Voltage". */
  path: string;
}

const flattenWithPath = (nodes: SubcategoryNode[], prefix = ''): FlatSubcat[] => {
  const out: FlatSubcat[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix} > ${node.nameEn}` : node.nameEn;
    out.push({ id: node.id, nameEn: node.nameEn, nameAr: node.nameAr, path });
    out.push(...flattenWithPath(node.children, path));
  }
  return out;
};

/** Loose key for matching user-typed names against catalogue names. */
const matchKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Strips any parent prefix so "Cables > Low Voltage" also matches "Low Voltage". */
const leafOf = (path: string) => path.split('>').pop()!.trim();

/* ─── Parsed rows ────────────────────────────────────────────────── */
interface ParsedRow {
  /** 1-based row number as it appears in the spreadsheet, header included. */
  sheetRow: number;
  categoryId: string;
  categoryNameEn: string;
  categoryNameAr: string;
  subcategoryId: string;
  subcategoryNameEn: string;
  subcategoryNameAr: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  keywords: string;
  slug: string;
  imageUrl: string;
  imageFileName: string;
  errors: string[];
  warnings: string[];
}

/** A ParsedRow with the image sources resolved against the picked files. */
interface ValidatedRow extends ParsedRow {
  imageFile?: File;
  hasImage: boolean;
}

interface BulkProductImportProps {
  categories: ProductCategory[];
  existingProducts: Product[];
  onClose: () => void;
}

type Step = 'upload' | 'review' | 'importing' | 'done';

/* ─── Component ──────────────────────────────────────────────────── */
export const BulkProductImport: React.FC<BulkProductImportProps> = ({
  categories,
  existingProducts,
  onClose,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [encodingWarning, setEncodingWarning] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map());
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [result, setResult] = useState<{ created: number; failed: number; errors: string[] }>({
    created: 0, failed: 0, errors: [],
  });

  const sheetInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  /** Flattened subcategory list per category, built once. */
  const subcatsByCategory = useMemo(() => {
    const map = new Map<string, FlatSubcat[]>();
    for (const cat of categories) {
      map.set(cat.id, cat.subcategories?.length ? flattenWithPath(cat.subcategories) : []);
    }
    return map;
  }, [categories]);

  /* ── Template download ──────────────────────────────────────── */
  const downloadTemplate = () => {
    const firstCat = categories[0];
    const firstSub = firstCat ? (subcatsByCategory.get(firstCat.id) || [])[0] : undefined;

    const example = [
      firstCat?.nameEn || 'Cables & Wires',
      firstSub?.path || '',
      'Low Voltage Power Cable',
      'كابل طاقة منخفض الجهد',
      'Copper conductor cable rated for 0.6/1 kV distribution networks.',
      'كابل موصل نحاسي مخصص لشبكات التوزيع بجهد 0.6/1 كيلو فولت.',
      'cable, copper, low voltage',
      '',
      '',
      'lv-power-cable.jpg',
    ];

    const ws = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], example]);
    ws['!cols'] = [
      { wch: 24 }, { wch: 28 }, { wch: 30 }, { wch: 30 }, { wch: 46 },
      { wch: 46 }, { wch: 26 }, { wch: 24 }, { wch: 34 }, { wch: 22 },
    ];

    // Reference sheet: the exact category / subcategory values that resolve.
    const refRows: string[][] = [['Category', 'Subcategory (copy exactly)']];
    for (const cat of categories) {
      const subs = subcatsByCategory.get(cat.id) || [];
      if (subs.length === 0) {
        refRows.push([cat.nameEn, '— no subcategories —']);
      } else {
        for (const s of subs) refRows.push([cat.nameEn, s.path]);
      }
    }
    const refWs = XLSX.utils.aoa_to_sheet(refRows);
    refWs['!cols'] = [{ wch: 32 }, { wch: 46 }];

    const notesWs = XLSX.utils.aoa_to_sheet([
      ['How to use this template'],
      [''],
      ['1.', 'Fill one product per row on the "Products" sheet. Do not rename the header row.'],
      ['2.', 'Copy Category and Subcategory values exactly from the "Categories" sheet.'],
      ['3.', 'Leave Subcategory blank only for categories that have none.'],
      ['4.', 'Slug is optional — it is generated from the English name when left blank.'],
      ['5.', 'For images either paste a full https:// link in "Image URL", or put the'],
      ['', 'image file name in "Image File" and select those files in the importer.'],
      ['6.', 'Save as .xlsx or .csv, then upload it in the Bulk Import window.'],
    ]);
    notesWs['!cols'] = [{ wch: 6 }, { wch: 90 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.utils.book_append_sheet(wb, refWs, 'Categories');
    XLSX.utils.book_append_sheet(wb, notesWs, 'Instructions');
    XLSX.writeFile(wb, 'product_import_template.xlsx');
  };

  /* ── Sheet parsing ──────────────────────────────────────────── */
  const handleSheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsParsing(true);
    setParseError(null);
    setEncodingWarning(null);
    try {
      const buffer = await file.arrayBuffer();
      // SheetJS decodes raw CSV bytes as latin1, which mangles Arabic. Decode
      // CSV as UTF-8 ourselves and hand it a string; .xlsx stores its strings
      // as UTF-8 XML internally, so the byte path is already correct there.
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      let wb: XLSX.WorkBook;
      if (isCsv) {
        let text = new TextDecoder('utf-8').decode(buffer);
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        if (text.includes('�')) {
          setEncodingWarning(
            'This CSV is not saved as UTF-8, so some non-English characters may be wrong. ' +
            'Re-save it as “CSV UTF-8” — or use .xlsx, which has no encoding pitfalls.'
          );
        }
        wb = XLSX.read(text, { type: 'string' });
      } else {
        wb = XLSX.read(buffer, { type: 'array' });
      }
      const sheetName = wb.SheetNames.find(n => normaliseHeader(n) === 'products') || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error('The file has no readable sheet.');

      const grid = XLSX.utils.sheet_to_json<string[]>(ws, {
        header: 1, raw: false, defval: '', blankrows: false,
      });
      if (grid.length < 2) throw new Error('The sheet has no data rows below the header.');

      const headerRow = grid[0].map(h => normaliseHeader(String(h ?? '')));
      const columnOf: Partial<Record<FieldKey, number>> = {};
      headerRow.forEach((h, i) => {
        const field = HEADER_ALIASES[h];
        if (field && columnOf[field] === undefined) columnOf[field] = i;
      });

      const missing = (['category', 'nameEn', 'nameAr', 'descriptionEn', 'descriptionAr'] as FieldKey[])
        .filter(f => columnOf[f] === undefined);
      if (missing.length) {
        throw new Error(
          `Missing required column(s): ${missing.join(', ')}. Download the template to see the expected headers.`
        );
      }

      const cell = (row: string[], field: FieldKey) => {
        const i = columnOf[field];
        return i === undefined ? '' : String(row[i] ?? '').trim();
      };

      // Slugs already taken, so the file cannot collide with the live catalogue.
      const takenSlugs = new Set(
        existingProducts.map(p => (p.slug || generateSlug(p.nameEn || '')).toLowerCase()).filter(Boolean)
      );

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < grid.length; i++) {
        const row = grid[i];
        const isBlank = TEMPLATE_HEADERS.every((_, ci) => !String(row[ci] ?? '').trim());
        if (isBlank) continue;

        const errors: string[] = [];
        const warnings: string[] = [];

        // Category — by English name, Arabic name, or document id.
        const categoryRaw = cell(row, 'category');
        const cat = categories.find(c =>
          matchKey(c.nameEn) === matchKey(categoryRaw) ||
          matchKey(c.nameAr || '') === matchKey(categoryRaw) ||
          c.id === categoryRaw
        );
        if (!categoryRaw) errors.push('Category is empty');
        else if (!cat) errors.push(`Unknown category "${categoryRaw}"`);

        // Subcategory — by full path, leaf name, or node id.
        const subcatRaw = cell(row, 'subcategory');
        const available = cat ? subcatsByCategory.get(cat.id) || [] : [];
        let sub: FlatSubcat | undefined;
        if (cat) {
          if (available.length === 0) {
            if (subcatRaw) warnings.push(`"${cat.nameEn}" has no subcategories — value ignored`);
          } else if (!subcatRaw) {
            errors.push(`Subcategory is required for "${cat.nameEn}"`);
          } else {
            // Subcategory paths are relative to the category, but people
            // naturally write the whole chain — "Electrical > Wiring Devices".
            // Drop a leading segment that just names the category again.
            let value = subcatRaw;
            if (value.includes('>')) {
              const [head, ...rest] = value.split('>');
              if (matchKey(head) === matchKey(cat.nameEn) || matchKey(head) === matchKey(cat.nameAr || '')) {
                value = rest.join('>').trim();
              }
            }
            const byPath = available.filter(s => matchKey(s.path) === matchKey(value));
            const byId = available.filter(s => s.id === value);
            const byLeaf = available.filter(s => matchKey(leafOf(s.path)) === matchKey(value));
            const byAr = available.filter(s => s.nameAr && matchKey(s.nameAr) === matchKey(value));
            const hits = byPath.length ? byPath : byId.length ? byId : byLeaf.length ? byLeaf : byAr;
            if (hits.length === 0) errors.push(`Unknown subcategory "${subcatRaw}" under "${cat.nameEn}"`);
            else if (hits.length > 1) {
              errors.push(`"${subcatRaw}" matches ${hits.length} subcategories — use the full path, e.g. "${hits[0].path}"`);
            } else sub = hits[0];
          }
        }

        const nameEn = cell(row, 'nameEn');
        const nameAr = cell(row, 'nameAr');
        const descriptionEn = cell(row, 'descriptionEn');
        const descriptionAr = cell(row, 'descriptionAr');
        if (!nameEn) errors.push('English name is empty');
        if (!nameAr) errors.push('Arabic name is empty');
        if (!descriptionEn) errors.push('English description is empty');
        if (!descriptionAr) errors.push('Arabic description is empty');

        // Slug — honour an explicit value, otherwise derive it, then de-duplicate.
        const slugRaw = cell(row, 'slug');
        const baseSlug = (slugRaw ? generateSlug(slugRaw) : generateSlug(nameEn)) || `product-${i}`;
        let slug = baseSlug;
        if (takenSlugs.has(slug)) {
          let n = 2;
          while (takenSlugs.has(`${baseSlug}-${n}`)) n++;
          slug = `${baseSlug}-${n}`;
          warnings.push(`Slug "${baseSlug}" is already taken — using "${slug}"`);
        }
        takenSlugs.add(slug);

        const imageUrl = cell(row, 'imageUrl');
        if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
          errors.push('Image URL must start with http:// or https://');
        }

        parsed.push({
          sheetRow: i + 1,
          categoryId: cat?.id || '',
          categoryNameEn: cat?.nameEn || '',
          categoryNameAr: cat?.nameAr || '',
          subcategoryId: sub?.id || '',
          subcategoryNameEn: sub?.nameEn || '',
          subcategoryNameAr: sub?.nameAr || '',
          nameEn, nameAr, descriptionEn, descriptionAr,
          keywords: cell(row, 'keywords'),
          slug,
          imageUrl,
          imageFileName: cell(row, 'imageFile'),
          errors,
          warnings,
        });
      }

      if (parsed.length === 0) throw new Error('No product rows found in the sheet.');

      setRows(parsed);
      setFileName(file.name);
      setStep('review');
    } catch (err) {
      console.error('Bulk import parse failed:', err);
      setParseError(err instanceof Error ? err.message : 'Could not read that file.');
    }
    setIsParsing(false);
  };

  /* ── Image picking ──────────────────────────────────────────── */
  const handleImagesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setImageFiles(prev => {
      const next = new Map(prev);
      for (const f of picked) next.set(f.name.toLowerCase(), f);
      return next;
    });
  };

  /** Rows re-checked against whatever images are currently selected. */
  const validated = useMemo<ValidatedRow[]>(() => rows.map(r => {
    const file = r.imageFileName ? imageFiles.get(r.imageFileName.toLowerCase()) : undefined;
    const hasImage = Boolean(r.imageUrl || file);
    const warnings = [...r.warnings];
    if (isExternalUrl(r.imageUrl)) {
      warnings.push('External image URL — will be downloaded and re-hosted in Storage');
    }
    if (!hasImage) {
      warnings.push(
        r.imageFileName
          ? `Image "${r.imageFileName}" not selected yet — will import without an image`
          : 'No image — will import without one'
      );
    }
    return { ...r, imageFile: file, hasImage, warnings };
  }), [rows, imageFiles]);

  const validRows = validated.filter(r => r.errors.length === 0);
  const errorCount = validated.length - validRows.length;
  const warningCount = validRows.filter(r => r.warnings.length > 0).length;
  const pendingImages = validRows.filter(r => r.imageFile).length;

  /* ── Import execution ───────────────────────────────────────── */
  const uploadImage = async (file: File): Promise<string> => {
    const prepared = await prepareImage(file, MAX_EDGE.card);
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${prepared.name}`;
    const task = uploadBytesResumable(ref(storage, `products/${unique}`), prepared, UPLOAD_METADATA);
    await task;
    return getDownloadURL(task.snapshot.ref);
  };

  /**
   * Fetch an external image so it can be re-hosted in Storage. The website only
   * serves images from firebasestorage.googleapis.com (next/image remotePatterns),
   * so a foreign URL saved as-is would crash the product page rather than just
   * show a broken photo. Subject to the remote host allowing CORS.
   */
  const fetchAsFile = async (url: string): Promise<File> => {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error(`not an image (${blob.type || 'unknown type'})`);
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const base = (new URL(url).pathname.split('/').pop() || '')
      .replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'image';
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  };

  const runImport = async () => {
    if (validRows.length === 0) return;
    setStep('importing');
    const failures: string[] = [];

    // 1. Images first — Storage uploads cannot participate in a Firestore batch.
    const withUrls: { row: ValidatedRow; imageUrl: string }[] = [];
    const uploadTotal = validRows.filter(r => r.imageFile || isExternalUrl(r.imageUrl)).length;
    let uploaded = 0;
    for (const row of validRows) {
      let imageUrl = row.imageUrl;
      if (isExternalUrl(imageUrl)) {
        setProgress({ current: uploaded, total: uploadTotal, label: `Downloading image ${uploaded + 1} of ${uploadTotal}` });
        try {
          imageUrl = await uploadImage(await fetchAsFile(imageUrl));
        } catch (err) {
          console.error(`Image download failed for row ${row.sheetRow}:`, err);
          const why = err instanceof Error ? err.message : 'blocked by the remote site';
          failures.push(`Row ${row.sheetRow} (${row.nameEn}): could not download image from URL (${why}) — imported without an image. Save the picture locally and use the "Image File" column instead.`);
          imageUrl = '';
        }
        uploaded++;
      } else if (!imageUrl && row.imageFile) {
        setProgress({ current: uploaded, total: uploadTotal, label: `Uploading image ${uploaded + 1} of ${uploadTotal}` });
        try {
          imageUrl = await uploadImage(row.imageFile);
        } catch (err) {
          console.error(`Image upload failed for row ${row.sheetRow}:`, err);
          failures.push(`Row ${row.sheetRow} (${row.nameEn}): image upload failed — imported without an image`);
        }
        uploaded++;
      }
      withUrls.push({ row, imageUrl });
    }

    // 2. Documents, in chunks well under the 500-operation batch ceiling.
    const CHUNK = 400;
    let created = 0;
    for (let i = 0; i < withUrls.length; i += CHUNK) {
      const slice = withUrls.slice(i, i + CHUNK);
      setProgress({
        current: i, total: withUrls.length,
        label: `Saving products ${i + 1}–${Math.min(i + CHUNK, withUrls.length)} of ${withUrls.length}`,
      });
      const batch = writeBatch(db);
      for (const { row, imageUrl } of slice) {
        batch.set(doc(collection(db, 'products')), {
          slug: row.slug,
          categoryId: row.categoryId,
          categoryNameEn: row.categoryNameEn,
          categoryNameAr: row.categoryNameAr,
          subcategoryId: row.subcategoryId,
          subcategoryNameEn: row.subcategoryNameEn,
          subcategoryNameAr: row.subcategoryNameAr,
          nameEn: row.nameEn,
          nameAr: row.nameAr,
          descriptionEn: row.descriptionEn,
          descriptionAr: row.descriptionAr,
          imageUrl,
          keywords: row.keywords,
          createdAt: serverTimestamp(),
        });
      }
      try {
        await batch.commit();
        created += slice.length;
      } catch (err) {
        console.error('Batch commit failed:', err);
        failures.push(`Rows ${slice[0].row.sheetRow}–${slice[slice.length - 1].row.sheetRow}: save failed`);
      }
    }

    setResult({ created, failed: validRows.length - created, errors: failures });
    setStep('done');
  };

  /* ── Render ─────────────────────────────────────────────────── */
  const closeGuarded = () => { if (step !== 'importing') onClose(); };

  return (
    <div className="bulk-overlay" onClick={e => { if (e.target === e.currentTarget) closeGuarded(); }}>
      <motion.div
        className="bulk-panel"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
      >
        {/* Header */}
        <div className="bulk-header">
          <div className="bulk-header-left">
            <FileSpreadsheet size={20} />
            <div>
              <div className="bulk-title">Bulk Import Products</div>
              <div className="bulk-subtitle">
                {step === 'upload' && 'Upload a spreadsheet to add many products at once'}
                {step === 'review' && `${fileName} — ${validated.length} row${validated.length === 1 ? '' : 's'}`}
                {step === 'importing' && 'Importing — please keep this window open'}
                {step === 'done' && 'Import finished'}
              </div>
            </div>
          </div>
          <button className="bulk-close" onClick={closeGuarded} disabled={step === 'importing'}>
            <X size={18} />
          </button>
        </div>

        {/* ── Step 1: upload ─────────────────────────────────── */}
        {step === 'upload' && (
          <div className="bulk-body">
            <ol className="bulk-steps">
              <li>
                <span className="bulk-step-num">1</span>
                <div>
                  <div className="bulk-step-title">Download the template</div>
                  <div className="bulk-step-desc">
                    Pre-filled with your {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} and every
                    subcategory, so the values you type always match.
                  </div>
                  <button className="bulk-btn-secondary" onClick={downloadTemplate}>
                    <Download size={15} /> Download Template (.xlsx)
                  </button>
                </div>
              </li>
              <li>
                <span className="bulk-step-num">2</span>
                <div>
                  <div className="bulk-step-title">Fill in one product per row</div>
                  <div className="bulk-step-desc">
                    Category, both names and both descriptions are required. Slug is generated from the English
                    name when left blank.
                  </div>
                </div>
              </li>
              <li>
                <span className="bulk-step-num">3</span>
                <div>
                  <div className="bulk-step-title">Upload the completed file</div>
                  <div className="bulk-step-desc">Accepts .xlsx, .xls and .csv. Nothing is saved until you confirm.</div>
                </div>
              </li>
            </ol>

            <div className="bulk-dropzone" onClick={() => sheetInputRef.current?.click()}>
              {isParsing ? (
                <><Loader2 size={26} className="bulk-spin" /><span>Reading file…</span></>
              ) : (
                <>
                  <UploadCloud size={30} />
                  <span className="bulk-dropzone-main">Choose a spreadsheet</span>
                  <span className="bulk-dropzone-sub">.xlsx, .xls or .csv</span>
                </>
              )}
              <input
                ref={sheetInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={handleSheetUpload}
              />
            </div>

            {parseError && (
              <div className="bulk-alert bulk-alert-error">
                <AlertTriangle size={15} /> <span>{parseError}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: review ─────────────────────────────────── */}
        {step === 'review' && (
          <div className="bulk-body">
            {encodingWarning && (
              <div className="bulk-alert bulk-alert-warn">
                <AlertTriangle size={15} /> <span>{encodingWarning}</span>
              </div>
            )}
            <div className="bulk-summary">
              <div className="bulk-stat bulk-stat-ok">
                <div className="bulk-stat-num">{validRows.length}</div>
                <div className="bulk-stat-label">Ready to import</div>
              </div>
              <div className={`bulk-stat ${errorCount ? 'bulk-stat-err' : ''}`}>
                <div className="bulk-stat-num">{errorCount}</div>
                <div className="bulk-stat-label">Blocked by errors</div>
              </div>
              <div className={`bulk-stat ${warningCount ? 'bulk-stat-warn' : ''}`}>
                <div className="bulk-stat-num">{warningCount}</div>
                <div className="bulk-stat-label">With warnings</div>
              </div>
            </div>

            <div className="bulk-images-row">
              <div className="bulk-images-info">
                <Images size={16} />
                <span>
                  {imageFiles.size === 0
                    ? 'Optional: select the image files referenced in the “Image File” column.'
                    : `${imageFiles.size} image file${imageFiles.size === 1 ? '' : 's'} selected · ${pendingImages} row${pendingImages === 1 ? '' : 's'} matched.`}
                </span>
              </div>
              <button className="bulk-btn-secondary" onClick={() => imagesInputRef.current?.click()}>
                <Images size={15} /> {imageFiles.size ? 'Add More Images' : 'Select Images'}
              </button>
              <input
                ref={imagesInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handleImagesPicked}
              />
            </div>

            <div className="bulk-table-wrap">
              <table className="bulk-table">
                <thead>
                  <tr>
                    <th className="bulk-col-row">Row</th>
                    <th className="bulk-col-status">Status</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="bulk-col-slug">Slug</th>
                    <th className="bulk-col-img">Image</th>
                  </tr>
                </thead>
                <tbody>
                  {validated.map(r => (
                    <tr key={r.sheetRow} className={r.errors.length ? 'bulk-row-error' : ''}>
                      <td className="bulk-col-row">{r.sheetRow}</td>
                      <td className="bulk-col-status">
                        {r.errors.length ? (
                          <span className="bulk-pill bulk-pill-err"><AlertTriangle size={11} /> Error</span>
                        ) : r.warnings.length ? (
                          <span className="bulk-pill bulk-pill-warn"><AlertTriangle size={11} /> Warning</span>
                        ) : (
                          <span className="bulk-pill bulk-pill-ok"><CheckCircle2 size={11} /> Ready</span>
                        )}
                      </td>
                      <td>
                        <div className="bulk-cell-main">{r.nameEn || <em>— no name —</em>}</div>
                        <div className="bulk-cell-ar" dir="rtl">{r.nameAr}</div>
                        {(r.errors.length > 0 || r.warnings.length > 0) && (
                          <ul className="bulk-issues">
                            {r.errors.map((m, i) => <li key={`e${i}`} className="bulk-issue-err">{m}</li>)}
                            {/* Warnings describe what the import will do, so they
                                only make sense on rows that will actually run. */}
                            {r.errors.length === 0 && r.warnings.map((m, i) => (
                              <li key={`w${i}`} className="bulk-issue-warn">{m}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        <div className="bulk-cell-main">{r.categoryNameEn || '—'}</div>
                        {r.subcategoryNameEn && <div className="bulk-cell-sub">› {r.subcategoryNameEn}</div>}
                      </td>
                      <td className="bulk-col-slug"><code>{r.slug}</code></td>
                      <td className="bulk-col-img">
                        {r.imageUrl ? (isStorageUrl(r.imageUrl) ? 'URL' : 'URL ↓') : r.imageFile ? 'File ✓' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Step 3: importing ──────────────────────────────── */}
        {step === 'importing' && (
          <div className="bulk-body bulk-body-center">
            <Loader2 size={34} className="bulk-spin" />
            <div className="bulk-progress-label">{progress.label || 'Preparing…'}</div>
            <div className="bulk-progress-track">
              <div
                className="bulk-progress-fill"
                style={{ width: `${progress.total ? Math.round((progress.current / progress.total) * 100) : 5}%` }}
              />
            </div>
            <div className="bulk-progress-note">Closing this window now would leave the import incomplete.</div>
          </div>
        )}

        {/* ── Step 4: done ───────────────────────────────────── */}
        {step === 'done' && (
          <div className="bulk-body bulk-body-center">
            <CheckCircle2 size={40} className="bulk-done-icon" />
            <div className="bulk-done-title">
              {result.created} product{result.created === 1 ? '' : 's'} imported
            </div>
            {result.failed > 0 && (
              <div className="bulk-done-sub">{result.failed} row{result.failed === 1 ? '' : 's'} could not be saved.</div>
            )}
            {errorCount > 0 && (
              <div className="bulk-done-sub">
                {errorCount} row{errorCount === 1 ? '' : 's'} were skipped because of validation errors.
              </div>
            )}
            {result.errors.length > 0 && (
              <ul className="bulk-done-errors">
                {result.errors.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="bulk-footer">
          {step === 'review' && (
            <button className="bulk-btn-ghost" onClick={() => { setStep('upload'); setRows([]); setFileName(''); }}>
              <ArrowLeft size={15} /> Choose another file
            </button>
          )}
          <div className="bulk-footer-right">
            {step !== 'importing' && (
              <button className="bulk-btn-ghost" onClick={closeGuarded}>
                {step === 'done' ? 'Close' : 'Cancel'}
              </button>
            )}
            {step === 'review' && (
              <button className="bulk-btn-primary" onClick={runImport} disabled={validRows.length === 0}>
                Import {validRows.length} Product{validRows.length === 1 ? '' : 's'} <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
