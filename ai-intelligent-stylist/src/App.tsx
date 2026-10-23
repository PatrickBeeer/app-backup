import { AppProps } from '../../../types';
import { AiIntelligentStylistApp } from '../AiIntelligentStylistApp';

export default function App({ platform, costs }: AppProps) {
  return <AiIntelligentStylistApp platform={platform} costs={costs} />;
}