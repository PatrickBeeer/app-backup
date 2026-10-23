import { AppProps } from '../../../types';
import { KidsStrollerAIStudioApp } from '../KidsStrollerAIStudioApp';

export default function App({ platform, costs }: AppProps) {
  return <KidsStrollerAIStudioApp platform={platform} costs={costs} />;
}
