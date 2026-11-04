'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
    UploadCloud,
    Link as LinkIcon,
    Image as ImageIcon,
    Trash2,
    Copy,
    Check,
    ExternalLink,
    AlertCircle,
    RefreshCw,
    FolderOpen,
    Eye
} from 'lucide-react';

export interface ImagePreset {
    label: string;
    url: string;
}

export const DEFAULT_STORE_PRESETS: ImagePreset[] = [
    { label: 'Logo KENZIxCheat', url: '/images/logo.svg' },
    { label: 'Aimhack APK Mod', url: '/images/aimhack.jpg' },
    { label: 'XREG VIP Cheat', url: '/images/xreg.png' },
    { label: 'Silent Aim VIP', url: '/images/silent.jpg' },
    { label: 'Rapid Fire Mod', url: '/images/rapid.jpg' },
    { label: 'BR Mods Free Fire', url: '/images/br-mods.jpg' },
    { label: 'Angry Mod VIP', url: '/images/angry.jpg' },
    { label: 'Pato Cheat VIP', url: '/images/pato.jpg' },
    { label: 'Migul Mod APK', url: '/images/migul.jpg' },
    { label: 'Drip Client', url: '/images/drip.jpg' },
    { label: 'Fluorite Client', url: '/images/fluorite.jpg' },
    { label: 'Gbox VIP', url: '/images/gbox.png' },
    { label: 'HG Cheat Engine', url: '/images/hg.jpg' },
];

interface ImageFieldEditorProps {
    label: string;
    value: string;
    onChange: (url: string) => void;
    placeholder?: string;
    description?: string;
    aspectRatio?: 'square' | 'video' | 'banner' | 'auto';
    folder?: string;
    required?: boolean;
    presets?: ImagePreset[];
}

export default function ImageFieldEditor({
    label,
    value,
    onChange,
    placeholder = 'https://example.com/gambar.png atau /images/...',
    description,
    aspectRatio = 'square',
    folder = 'assets',
    required = false,
    presets = DEFAULT_STORE_PRESETS,
}: ImageFieldEditorProps) {
    const [mode, setMode] = useState<'url' | 'upload' | 'preset'>('url');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset error when value changes
    useEffect(() => {
        setImgError(false);
    }, [value]);

    // Copy URL to clipboard
    const handleCopy = async () => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.warn('Copy failed:', err);
        }
    };

    // Paste from clipboard into URL
    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                onChange(text.trim());
            }
        } catch (err) {
            console.warn('Paste failed:', err);
        }
    };

    // Compress large images in browser before upload for fast transfer
    const compressImage = (file: File, maxDimension = 1600, quality = 0.85): Promise<Blob> => {
        return new Promise((resolve) => {
            // If already small (< 500KB) or SVG, don't recompress
            if (file.size < 500 * 1024 || file.type === 'image/svg+xml') {
                resolve(file);
                return;
            }

            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let { width, height } = img;
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(file);
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);

                // Use WebP if available, fallback to JPEG
                const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                canvas.toBlob(
                    (blob) => {
                        if (blob && blob.size < file.size) {
                            resolve(blob);
                        } else {
                            resolve(file);
                        }
                    },
                    mime,
                    quality
                );
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(file);
            };
            img.src = url;
        });
    };

    // Process file upload
    const handleFileUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('Silakan pilih file gambar (JPG, PNG, WEBP, GIF, SVG).');
            return;
        }

        setIsUploading(true);
        setUploadProgress('Mengoptimalkan ukuran gambar...');

        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') || '' : '';
            const compressedBlob = await compressImage(file);

            setUploadProgress('Mengunggah ke Cloud Storage...');

            const formData = new FormData();
            formData.append('file', compressedBlob, file.name);
            formData.append('folder', folder);

            const res = await fetch('/api/admin/upload', {
                method: 'POST',
                headers: {
                    'x-admin-token': token,
                    'x-admin-pin': token || 'admin123',
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            const data = await res.json();
            if (data.success && data.url) {
                onChange(data.url);
                setImgError(false);
                setMode('url');
            } else {
                throw new Error(data.message || 'Gagal mengunggah foto');
            }
        } catch (err: any) {
            console.warn('Upload API error, falling back to FileReader:', err);
            setUploadProgress('Menyimpan secara lokal...');

            // Fallback: Read as base64 Data URL so user is never blocked
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target?.result as string;
                if (base64) {
                    onChange(base64);
                    setImgError(false);
                    setMode('url');
                }
            };
            reader.readAsDataURL(file);
        } finally {
            setIsUploading(false);
            setUploadProgress('');
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    // Helper for preview container aspect ratio
    const previewRatioClass = {
        square: 'w-20 h-20 sm:w-24 sm:h-24',
        video: 'w-36 h-20 sm:w-44 sm:h-24',
        banner: 'w-40 h-20 sm:w-48 sm:h-24',
        auto: 'w-20 h-20 sm:w-24 sm:h-24',
    }[aspectRatio];

    const isSupabaseUrl = value?.includes('supabase.co');
    const isLocalAsset = value?.startsWith('/images/');
    const isDataUrl = value?.startsWith('data:image/');

    return (
        <div className="w-full p-4 sm:p-5 rounded-2xl bg-[#0b0617] border border-[#281652] space-y-3.5">
            {/* 1. Header: Label & Status */}
            <div>
                <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-bold text-gray-200 uppercase tracking-wider block">
                        {label} {required && <span className="text-red-400">*</span>}
                    </label>
                    {value ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                            <Check className="w-3 h-3" />
                            <span>Terpasang</span>
                        </span>
                    ) : (
                        <span className="text-[10px] text-gray-500 shrink-0 font-medium">
                            {required ? 'Wajib diisi' : 'Belum diatur'}
                        </span>
                    )}
                </div>
                {description && (
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        {description}
                    </p>
                )}
            </div>

            {/* 2. Mode Selector Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-[#120a26] border border-[#281652] rounded-xl overflow-x-auto">
                <button
                    type="button"
                    onClick={() => setMode('url')}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${mode === 'url'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>Link URL</span>
                </button>
                <button
                    type="button"
                    onClick={() => setMode('upload')}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${mode === 'upload'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload File</span>
                </button>
                {presets && presets.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setMode('preset')}
                        className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${mode === 'preset'
                            ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                            }`}
                    >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Pilih Galeri</span>
                    </button>
                )}
            </div>

            {/* 3. Mode Input Controls */}
            {/* Mode 1: URL Input */}
            {mode === 'url' && (
                <div className="space-y-1.5">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={value || ''}
                                onChange={(e) => onChange(e.target.value)}
                                placeholder={placeholder}
                                required={required}
                                className="w-full bg-[#120a26] border border-[#281652] rounded-xl pl-3.5 pr-20 py-2.5 text-white text-xs focus:outline-none focus:border-purple-500 font-mono placeholder:text-gray-600"
                            />
                            <button
                                type="button"
                                onClick={handlePaste}
                                title="Tempel dari Clipboard"
                                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[10px] font-semibold bg-purple-950/80 hover:bg-purple-900 border border-purple-500/30 rounded-lg text-purple-300 transition-colors"
                            >
                                Tempel
                            </button>
                        </div>
                        {value && (
                            <button
                                type="button"
                                onClick={() => onChange('')}
                                title="Hapus Gambar"
                                className="px-3 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 rounded-xl text-red-400 transition-colors shrink-0"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Mode 2: Upload File */}
            {mode === 'upload' && (
                <div className="space-y-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                handleFileUpload(e.target.files[0]);
                            }
                        }}
                    />

                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-5 border-2 border-dashed rounded-xl cursor-pointer text-center transition-all ${isDragging
                            ? 'border-purple-500 bg-purple-950/40'
                            : 'border-[#281652] hover:border-purple-500/60 bg-[#120a26]'
                            } ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                        {isUploading ? (
                            <div className="py-2 space-y-2">
                                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
                                <p className="text-xs text-purple-300 font-medium">{uploadProgress || 'Mengunggah gambar...'}</p>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <UploadCloud className="w-7 h-7 text-purple-400 mx-auto" />
                                <p className="text-xs font-semibold text-gray-200">
                                    Klik untuk pilih foto dari galeri / perangkat
                                </p>
                                <p className="text-[10px] text-gray-400">
                                    Mendukung JPG, PNG, WEBP, GIF, SVG (Maks. 10MB) • Drag & drop file ke sini
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Mode 3: Preset Galeri Toko */}
            {mode === 'preset' && (
                <div className="p-3 bg-[#120a26] border border-[#281652] rounded-xl space-y-2">
                    <p className="text-[11px] font-semibold text-gray-400">
                        Pilih aset gambar resmi dari server toko:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                        {presets.map((preset, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                    onChange(preset.url);
                                    setMode('url');
                                }}
                                className={`p-1.5 rounded-lg border text-left transition-all group flex items-center gap-2 ${value === preset.url
                                    ? 'border-purple-500 bg-purple-950/60'
                                    : 'border-[#281652] hover:border-purple-500/40 bg-[#090514]'
                                    }`}
                            >
                                <div className="w-8 h-8 rounded bg-black/40 overflow-hidden shrink-0">
                                    <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                                </div>
                                <span className="text-[10px] text-gray-300 group-hover:text-white truncate">
                                    {preset.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 4. Live Preview Card */}
            {value && (
                <div className="p-3.5 rounded-xl bg-[#120a26] border border-[#281652] space-y-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-gray-400 flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5 text-purple-400" />
                            Live Preview Foto
                        </span>

                        {/* Origin tag */}
                        <div className="flex items-center gap-1">
                            {isSupabaseUrl && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    Cloud CDN
                                </span>
                            )}
                            {isLocalAsset && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                    Aset Lokal
                                </span>
                            )}
                            {isDataUrl && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    Data URI
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        {/* Image Box */}
                        <div className={`${previewRatioClass} rounded-xl overflow-hidden bg-black/60 border border-purple-500/30 shrink-0 relative flex items-center justify-center`}>
                            {imgError ? (
                                <div className="p-2 text-center text-red-400 space-y-1">
                                    <AlertCircle className="w-5 h-5 mx-auto" />
                                    <span className="text-[9px] block">Gagal memuat</span>
                                </div>
                            ) : (
                                <img
                                    src={value}
                                    alt="Preview"
                                    className="w-full h-full object-cover"
                                    onError={() => setImgError(true)}
                                />
                            )}
                        </div>

                        {/* Details & Actions */}
                        <div className="min-w-0 flex-1 space-y-2 w-full">
                            <p className="text-[11px] font-mono text-gray-300 truncate bg-[#090514] px-2.5 py-1.5 rounded-lg border border-[#281652]" title={value}>
                                {value}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg bg-[#090514] hover:bg-purple-950 border border-[#281652] hover:border-purple-500/50 text-gray-300 hover:text-white transition-colors"
                                >
                                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    <span>{copied ? 'Tersalin' : 'Salin URL'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg bg-[#090514] hover:bg-purple-950 border border-[#281652] hover:border-purple-500/50 text-gray-300 hover:text-white transition-colors"
                                >
                                    <UploadCloud className="w-3 h-3" />
                                    <span>Ganti File</span>
                                </button>

                                {value.startsWith('http') && (
                                    <a
                                        href={value}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg bg-[#090514] hover:bg-purple-950 border border-[#281652] hover:border-purple-500/50 text-gray-300 hover:text-white transition-colors"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        <span>Buka Tab Baru</span>
                                    </a>
                                )}

                                <button
                                    type="button"
                                    onClick={() => onChange('')}
                                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg bg-red-950/30 hover:bg-red-900/50 border border-red-500/30 text-red-400 transition-colors sm:ml-auto"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Hapus</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
