import { AppProps } from '../../../types';
import { AIPromptGeneratorV2App } from '../AIPromptGeneratorV2App';

export default function App({ platform, costs }: AppProps) {
  return <AIPromptGeneratorV2App platform={platform} costs={costs} />;
}