import React, { useState } from 'react';
import ChevronDownIcon from './icons/ChevronDownIcon';

interface ModelOptionsProps {
  modelAge: string;
  setModelAge: (age: string) => void;
  modelEthnicity: string;
  setModelEthnicity: (ethnicity: string) => void;
}

const ModelOptions: React.FC<ModelOptionsProps> = ({ modelAge, setModelAge, modelEthnicity, setModelEthnicity }) => {
  const [isAgeOpen, setIsAgeOpen] = useState(true);
  const [isEthnicityOpen, setIsEthnicityOpen] = useState(true);

  const ageOptions = ['0-3岁', '3-5岁', '6-8岁', '9-12岁', '12-15+岁'];
  const ethnicityOptions = ['亚洲人', '白种人', '非洲裔', '拉丁裔'];

  const OptionButton: React.FC<{ label: string; isSelected: boolean; onClick: () => void; }> = ({ label, isSelected, onClick }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full border text-sm font-medium transition-all duration-200 transform hover:scale-105 ${
        isSelected
          ? 'bg-gradient-to-r from-blue-500 to-purple-600 border-transparent text-white shadow-md shadow-purple-300/50'
          : 'bg-white/30 border-white/70 text-slate-600 hover:bg-white/50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-700 text-center">3. 选择模特细节</h2>
      <div className="space-y-4">
        {/* Age Section */}
        <div className="border rounded-2xl bg-white/20 border-white/40 overflow-hidden transition-all duration-300">
          <button
            onClick={() => setIsAgeOpen(!isAgeOpen)}
            className="w-full flex justify-between items-center p-4 text-left font-medium text-slate-600 focus:outline-none"
            aria-expanded={isAgeOpen}
          >
            <span>年龄</span>
            <ChevronDownIcon className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isAgeOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isAgeOpen ? 'max-h-96' : 'max-h-0'}`}>
            <div className="px-4 pb-4">
              <div className="flex flex-wrap justify-center sm:justify-start gap-3">
                {ageOptions.map((age) => (
                  <OptionButton key={age} label={age} isSelected={modelAge === age} onClick={() => setModelAge(age)} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Ethnicity Section */}
        <div className="border rounded-2xl bg-white/20 border-white/40 overflow-hidden transition-all duration-300">
          <button
            onClick={() => setIsEthnicityOpen(!isEthnicityOpen)}
            className="w-full flex justify-between items-center p-4 text-left font-medium text-slate-600 focus:outline-none"
            aria-expanded={isEthnicityOpen}
          >
            <span>人种</span>
            <ChevronDownIcon className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isEthnicityOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isEthnicityOpen ? 'max-h-96' : 'max-h-0'}`}>
            <div className="px-4 pb-4">
              <div className="flex flex-wrap justify-center sm:justify-start gap-3">
                {ethnicityOptions.map((ethnicity) => (
                  <OptionButton key={ethnicity} label={ethnicity} isSelected={modelEthnicity === ethnicity} onClick={() => setModelEthnicity(ethnicity)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelOptions;

