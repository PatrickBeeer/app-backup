import { AppProps } from '../../../types';
import { ViralTitleGeneratorApp } from '../ViralTitleGeneratorApp';

export default function App({ platform, costs }: AppProps) {
  return <ViralTitleGeneratorApp platform={platform} costs={costs} />;
}
