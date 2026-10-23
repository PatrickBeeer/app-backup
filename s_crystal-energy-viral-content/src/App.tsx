import { AppProps } from '../../../types';
import { CrystalEnergyViralContentApp } from '../CrystalEnergyViralContentApp';

export default function App({ platform, costs }: AppProps) {
  return <CrystalEnergyViralContentApp platform={platform} costs={costs} />;
}
