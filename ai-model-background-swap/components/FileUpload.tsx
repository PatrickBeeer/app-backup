import React, { useRef, useState } from 'react';

interface FileUploadProps {
  label: string;
  onFileChange: (file: File | null) => void;
  required?: boolean;
  fileType?: string; // e.g., "image/*"
  currentFilePreview?: string | null;
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  label,
  onFileChange,
  required = false,
  fileType = 'image/*',
  currentFilePreview,
  className,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentFilePreview || null);

  React.useEffect(() => {
    setPreviewUrl(currentFilePreview || null);
  }, [currentFilePreview]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    onFileChange(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('border-blue-500');
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('border-blue-500');
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('border-blue-500');
    const files = event.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      onFileChange(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={`mb-4 ${className || ''}`}>
      <label className="block text-gray-600 text-sm font-semibold mb-2 uppercase tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div
        className={`
          relative p-4 border-2 border-dashed border-gray-300 rounded-xl
          bg-white/40 hover:bg-white/50 transition-colors duration-200
          flex flex-col items-center justify-center cursor-pointer
        `}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 不使用原生 required：隐藏的 required 会导致提交时浏览器无法 focus 无效控件，表现为点击无反应且控制台报错 */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept={fileType}
          className="hidden"
          required={false}
        />
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="预览图"
            className="max-h-48 w-auto object-contain rounded-lg mb-2"
          />
        ) : (
          <div className="text-gray-500 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8 mx-auto mb-2 text-gray-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm">将图片拖拽至此，或点击选择文件</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;

