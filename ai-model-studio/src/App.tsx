import { AppProps } from '../../../types';
import { AiModelStudioApp } from '../AiModelStudioApp';

export default function App({ platform, costs }: AppProps) {
  return <AiModelStudioApp platform={platform} costs={costs} />;
}