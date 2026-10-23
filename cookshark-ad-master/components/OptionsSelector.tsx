import React from 'react';

interface OptionsSelectorProps {
  gender: string;
  setGender: (gender: string) => void;
  scene: string;
  setScene: (scene: string) => void;
  aspectRatio: string;
  setAspectRatio: (ratio: string) => void;
  disabled: boolean;
}

// --- Icons ---
const StreetIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-600 group-hover:text-indigo-400 transition-colors" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
);
const OutdoorIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-600 group-hover:text-indigo-400 transition-colors" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" /></svg>
);
const DrivingIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-600 group-hover:text-indigo-400 transition-colors" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5-1.5-.5M6.75 7.364V3h-3v18m3-13.636l1.5-2.25L12 3.5l1.5 2.25 1.5 2.25M9 13.5l3 3m0 0l3-3m-3 3v-6m0 6h.008v.008H12v-.008z" /></svg>
);
const FishingIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-600 group-hover:text-indigo-400 transition-colors" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 4.75c0 1.036-.84 1.875-1.875 1.875V19.5A2.25 2.25 0 0112.375 21.75H4.5A2.25 2.25 0 012.25 19.5V6.625C2.25 5.59 3.09 4.75 4.125 4.75h12.375zM16.5 4.75L18 6.25m0 0l1.5-1.5m-1.5 1.5v1.5m0 0l1.5 1.5m-1.5-1.5L18 9m3-3l1.5 1.5m-1.5-1.5L21 3m0 3v1.5m0 0l1.5 1.5m-1.5-1.5l-1.5-1.5m-1.5 9l-3-3m0 0l-3 3m3-3v6m-6 0h12" /></svg>
);
const ClimbingIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-600 group-hover:text-indigo-400 transition-colors" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 010-1.5zM3.75 14.25h16.5a.75.75 0 010 1.5H3.75a.75.75 0 010-1.5zM5.25 18.75h13.5a.75.75 0 010 1.5H5.25a.75.75 0 010-1.5zM3.75 6H12m0 0V2.25M12 6h8.25" /></svg>
);
const HikingIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-600 group-hover:text-indigo-400 transition-colors" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 15.75L3 12m0 0l3.75-3.75M3 12h18" /></svg>
);

interface Option<T> { key: T; label: string; icon?: React.FC<{ className?: string }> }
const genderOptions: Option<string>[] = [{ key: 'Female', label: '女' }, { key: 'Male', label: '男' }];
const sceneOptions: Option<string>[] = [
  { key: 'Street', label: '街拍', icon: StreetIcon },
  { key: 'Outdoor', label: '户外', icon: OutdoorIcon },
  { key: 'Driving', label: '驾驶', icon: DrivingIcon },
  { key: 'Fishing', label: '钓鱼', icon: FishingIcon },
  { key: 'Climbing', label: '攀登', icon: ClimbingIcon },
  { key: 'Hiking', label: '徒步', icon: HikingIcon }
];
const aspectRatioOptions: Option<string>[] = [{ key: '3:4', label: '3:4' }, { key: '1:1', label: '1:1' }, { key: '9:16', label: '9:16' }, { key: '16:9', label: '16:9' }];

// --- Reusable Components ---
const SegmentedControl: React.FC<{
  options: Option<string>[];
  selectedKey: string;
  onSelect: (key: string) => void;
  disabled: boolean;
}> = ({ options, selectedKey, onSelect, disabled }) => (
  <div className="flex w-full p-1 bg-slate-100 rounded-xl">
    {options.map((option) => (
      <button
        key={option.key}
        type="button"
        onClick={() => onSelect(option.key)}
        disabled={disabled}
        className={`w-full text-center px-4 py-2 text-sm font-bold rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500
          ${selectedKey === option.key
            ? 'bg-slate-200 text-indigo-400 shadow'
            : 'text-slate-600 hover:bg-slate-200/60'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >{option.label}</button>
    ))}
  </div>
);

const SceneCard: React.FC<{
  option: Option<string>;
  isSelected: boolean;
  onClick: () => void;
  disabled: boolean;
}> = ({ option, isSelected, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`group flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-300
      ${isSelected
        ? 'bg-indigo-900/40 border-indigo-500 shadow-md'
        : 'bg-slate-100/50 border-transparent hover:border-indigo-400 hover:bg-slate-100'
      }
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    `}
  >
    {option.icon && <option.icon />}
    <span className={`font-medium text-sm transition-colors ${isSelected ? 'text-indigo-300' : 'text-slate-700'}`}>{option.label}</span>
  </button>
);

// --- Main Component ---
export const OptionsSelector: React.FC<OptionsSelectorProps> = ({ gender, setGender, scene, setScene, aspectRatio, setAspectRatio, disabled }) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-3">模特性别</h3>
        <SegmentedControl options={genderOptions} selectedKey={gender} onSelect={setGender} disabled={disabled} />
      </div>
      <div>
        <h3 className="text-base font-semibold text-white mb-3">图片比例</h3>
        <SegmentedControl options={aspectRatioOptions} selectedKey={aspectRatio} onSelect={setAspectRatio} disabled={disabled} />
      </div>
      <div>
        <h3 className="text-base font-semibold text-white mb-3">场景</h3>
        <div className="grid grid-cols-3 gap-3">
          {sceneOptions.map((option) => (
            <SceneCard
              key={option.key}
              option={option}
              isSelected={scene === option.key}
              onClick={() => setScene(option.key)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

