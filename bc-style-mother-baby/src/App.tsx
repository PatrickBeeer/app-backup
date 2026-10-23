import React from 'react';
import { AppProps } from '../../../types';
import { BcStyleMotherBabyApp } from '../BcStyleMotherBabyApp';

const App: React.FC<AppProps> = ({ platform, costs }) => {
  return <BcStyleMotherBabyApp platform={platform} costs={costs} />;
};

export default App;
